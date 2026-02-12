// src/engine/paletteReader.ts
// Reads the vscode-palette.json written by matugen, validates it,
// and returns a clean ColorMap of { "token.name": "#rrggbb" }.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ColorMap, PaletteFile, PaletteReadResult } from "../types";
import { logger } from "../utils/logger";

/** Matches 3, 4, 6, or 8-digit hex colors */
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isHex(v: string): boolean {
  return HEX_RE.test(v);
}

/** Keys starting with "_" are metadata — skip them */
function isColorToken(key: string): boolean {
  return !key.startsWith("_") && key.includes(".");
}

/**
 * Resolves the palette path, expanding `~` and falling back to the
 * VSCodium default location.
 */
export function resolvePalettePath(customPath: string | undefined): string {
  if (customPath && customPath.trim() !== "") {
    const expanded = customPath.startsWith("~")
      ? path.join(os.homedir(), customPath.slice(1))
      : customPath;
    return expanded;
  }

  // Default: works on both VS Code and VSCodium
  // VS Code    → ~/.config/Code/User/Theme/vscode-palette.json
  // VSCodium   → ~/.config/VSCodium/User/Theme/vscode-palette.json
  const configDir = process.env["XDG_CONFIG_HOME"] ?? path.join(os.homedir(), ".config");
  return path.join(configDir, "VSCodium", "User", "Theme", "vscode-palette.json");
}

/**
 * Synchronously reads and parses the palette file.
 * Returns a PaletteReadResult discriminated union — never throws.
 */
export function readPalette(filePath: string): PaletteReadResult {
  // ── existence check ──────────────────────────────────────────────
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `Palette file not found: ${filePath}` };
  }

  // ── read ─────────────────────────────────────────────────────────
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    return { ok: false, error: `Cannot read palette file: ${(e as Error).message}` };
  }

  // ── parse ─────────────────────────────────────────────────────────
  let parsed: PaletteFile;
  try {
    parsed = JSON.parse(raw) as PaletteFile;
  } catch (e) {
    return { ok: false, error: `Palette JSON is malformed: ${(e as Error).message}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Palette JSON must be a plain object at root level." };
  }

  // ── extract valid color tokens ────────────────────────────────────
  const colors: ColorMap = {};
  let skipped = 0;

  for (const [key, value] of Object.entries(parsed)) {
    if (!isColorToken(key)) continue;
    if (typeof value !== "string") { skipped++; continue; }
    if (!isHex(value)) {
      logger.debug(`Skipping non-hex value for token "${key}": ${value}`);
      skipped++;
      continue;
    }
    colors[key] = value;
  }

  const count = Object.keys(colors).length;
  if (count === 0) {
    return { ok: false, error: "Palette file contained no valid VS Code color tokens." };
  }

  logger.debug(`Palette loaded: ${count} token(s) applied, ${skipped} skipped.`);
  return { ok: true, colors };
}
