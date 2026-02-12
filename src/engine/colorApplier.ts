// src/engine/colorApplier.ts
// The core applier:
//  1. Reads current workbench.colorCustomizations from VS Code settings
//  2. Strips only the keys we previously managed (tracked via __matugenBridge)
//  3. Merges fresh palette colors on top of remaining user colors
//  4. Writes the result back — no reload, no restart
//
// The managed-key tracking is what makes this safe:
//  - We never touch keys the user set themselves
//  - If the user adds a color that overlaps ours, their next manual change
//    will persist because we only overwrite keys from the palette

import * as vscode from "vscode";
import type { ColorMap, ManagedMeta } from "../types";
import { MANAGED_KEY } from "../types";
import { logger } from "../utils/logger";

/** The VS Code settings key we write to */
const COLOR_CUSTOMIZATIONS = "workbench.colorCustomizations";

/** VS Code config target — Global (user settings.json) */
const TARGET = vscode.ConfigurationTarget.Global;

/**
 * Applies `newColors` to workbench.colorCustomizations.
 *
 * Merge strategy:
 *   final = { ...existingUserColors } - { ...previouslyManagedKeys } + { ...newColors }
 *
 * This means:
 *   ✅ User's own colors are preserved
 *   ✅ Our old colors are cleanly replaced (not accumulated)
 *   ✅ New palette overwrites its own previous values
 *   ❌ We never touch colors the user set themselves
 */
export async function applyColors(newColors: ColorMap): Promise<void> {
  const config = vscode.workspace.getConfiguration();

  // ── read current state ────────────────────────────────────────────
  const current = config.get<Record<string, unknown>>(COLOR_CUSTOMIZATIONS, {});

  // ── recover our previously managed keys ──────────────────────────
  const meta = current[MANAGED_KEY] as ManagedMeta | undefined;
  const previouslyManaged: string[] = meta?.keys ?? [];

  // ── build the new map ─────────────────────────────────────────────
  // Start from a copy of what exists
  const next: Record<string, unknown> = { ...current };

  // Remove only keys we owned before (avoids stale colors persisting
  // when the palette removes a token)
  for (const key of previouslyManaged) {
    delete next[key];
  }

  // Remove the old meta entry; we'll write a fresh one
  delete next[MANAGED_KEY];

  // Merge new palette colors on top
  for (const [token, hex] of Object.entries(newColors)) {
    next[token] = hex;
  }

  // Write updated metadata so next run knows what we own
  const newMeta: ManagedMeta = {
    keys: Object.keys(newColors),
    appliedAt: new Date().toISOString(),
  };
  next[MANAGED_KEY] = newMeta;

  // ── write back ────────────────────────────────────────────────────
  // VS Code applies this to the running editor INSTANTLY — no reload.
  await config.update(COLOR_CUSTOMIZATIONS, next, TARGET);

  logger.info(`Applied ${Object.keys(newColors).length} color overrides.`);
}

/**
 * Removes all colors previously applied by this extension, restoring
 * the user's own settings cleanly.
 */
export async function clearColors(): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const current = config.get<Record<string, unknown>>(COLOR_CUSTOMIZATIONS, {});

  const meta = current[MANAGED_KEY] as ManagedMeta | undefined;
  if (!meta || meta.keys.length === 0) {
    logger.info("No managed colors found — nothing to clear.");
    return;
  }

  const next: Record<string, unknown> = { ...current };
  for (const key of meta.keys) {
    delete next[key];
  }
  delete next[MANAGED_KEY];

  await config.update(COLOR_CUSTOMIZATIONS, next, TARGET);
  logger.info(`Cleared ${meta.keys.length} managed color override(s).`);
}

/**
 * Returns a summary of what we currently manage, for status display.
 */
export function getManagedStatus(): { count: number; appliedAt: string | null } {
  const config = vscode.workspace.getConfiguration();
  const current = config.get<Record<string, unknown>>(COLOR_CUSTOMIZATIONS, {});
  const meta = current[MANAGED_KEY] as ManagedMeta | undefined;

  return {
    count: meta?.keys.length ?? 0,
    appliedAt: meta?.appliedAt ?? null,
  };
}
