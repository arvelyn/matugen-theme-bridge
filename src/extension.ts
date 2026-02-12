// src/extension.ts
// Extension entry point — wires everything together.
//
// Lifecycle:
//   activate()  → read config → resolve palette path
//               → apply palette immediately
//               → start file watcher
//               → register commands
//               → listen for config changes
//
//   deactivate() → dispose watcher & logger (colors remain — intentional)

import * as vscode from "vscode";
import { resolvePalettePath, readPalette } from "./engine/paletteReader";
import { applyColors, clearColors, getManagedStatus } from "./engine/colorApplier";
import { PaletteWatcher } from "./watcher/paletteWatcher";
import { logger } from "./utils/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("matugenBridge")
    .get<boolean>("enabled", true);
}

function getCustomPath(): string | undefined {
  return vscode.workspace
    .getConfiguration("matugenBridge")
    .get<string>("palettePath");
}

/**
 * Core apply logic: read → validate → merge → write.
 * All errors are surfaced as VS Code notifications — never throws.
 */
async function applyPalette(palettePath: string, silent = false): Promise<void> {
  if (!isEnabled()) {
    logger.debug("Extension is disabled — skipping apply.");
    return;
  }

  logger.debug(`Reading palette from: ${palettePath}`);
  const result = readPalette(palettePath);

  if (!result.ok) {
    logger.error(result.error);
    if (!silent) {
      vscode.window.showWarningMessage(`Matugen Bridge: ${result.error}`);
    }
    return;
  }

  try {
    await applyColors(result.colors);
    if (!silent) {
      vscode.window.setStatusBarMessage(
        `$(paintcan) Matugen: ${Object.keys(result.colors).length} colors applied`,
        4000
      );
    }
  } catch (e) {
    const msg = `Failed to write color customizations: ${(e as Error).message}`;
    logger.error(msg);
    vscode.window.showErrorMessage(`Matugen Bridge: ${msg}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Activate
// ─────────────────────────────────────────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger.info("Matugen Theme Bridge activating…");

  // ── resolve initial palette path ──────────────────────────────────
  let palettePath = resolvePalettePath(getCustomPath());

  // ── create watcher ────────────────────────────────────────────────
  const watcher = new PaletteWatcher(async () => {
    await applyPalette(watcher.watchedPath, true);
  });
  watcher.start(palettePath);
  context.subscriptions.push(watcher);

  // ── apply immediately on startup ──────────────────────────────────
  await applyPalette(palettePath, true);

  // ── commands ──────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("matugenBridge.applyNow", async () => {
      const p = resolvePalettePath(getCustomPath());
      await applyPalette(p, false);
    }),

    vscode.commands.registerCommand("matugenBridge.clearOverrides", async () => {
      await clearColors();
      vscode.window.showInformationMessage("Matugen Bridge: Color overrides cleared.");
    }),

    vscode.commands.registerCommand("matugenBridge.showStatus", () => {
      const status = getManagedStatus();
      const p = resolvePalettePath(getCustomPath());
      if (status.count === 0) {
        vscode.window.showInformationMessage(
          `Matugen Bridge: No active overrides.\nWatching: ${p}`
        );
      } else {
        vscode.window.showInformationMessage(
          `Matugen Bridge: ${status.count} color(s) active\n` +
          `Last applied: ${status.appliedAt ?? "unknown"}\n` +
          `Watching: ${p}`
        );
      }
      logger.show();
    })
  );

  // ── react to config changes ───────────────────────────────────────
  // If the user changes palettePath or debounceMs, restart the watcher
  // and re-apply immediately. No restart needed.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("matugenBridge")) {
        logger.debug("Configuration changed — reinitialising watcher.");
        palettePath = resolvePalettePath(getCustomPath());
        watcher.start(palettePath);

        if (e.affectsConfiguration("matugenBridge.enabled") ||
            e.affectsConfiguration("matugenBridge.palettePath")) {
          if (isEnabled()) {
            await applyPalette(palettePath, true);
          } else {
            logger.info("Extension disabled by configuration.");
          }
        }
      }
    })
  );

  context.subscriptions.push(logger);
  logger.info(`Matugen Theme Bridge active. Watching: ${palettePath}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Deactivate
// ─────────────────────────────────────────────────────────────────────────────

export function deactivate(): void {
  // VS Code disposes all context.subscriptions automatically.
  // Colors remain in settings.json intentionally — the user can
  // run "Matugen: Clear Color Overrides" to remove them manually.
  logger.info("Matugen Theme Bridge deactivated. Colors remain until manually cleared.");
}
