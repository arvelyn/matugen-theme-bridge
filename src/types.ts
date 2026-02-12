// src/types.ts
// Shared types across all modules

/** A flat map of VS Code color-token IDs → hex color strings */
export type ColorMap = Record<string, string>;

/**
 * Shape of the vscode-palette.json file written by matugen.
 * Every key that contains a dot is treated as a VS Code color token.
 * Keys starting with "_" are reserved for metadata and are ignored.
 */
export interface PaletteFile {
  _meta?: {
    generated?: string;
    source?: string;
    variant?: string;
    [key: string]: unknown;
  };
  [token: string]: string | Record<string, unknown> | undefined;
}

/** Discriminated union returned by the palette reader */
export type PaletteReadResult =
  | { ok: true; colors: ColorMap }
  | { ok: false; error: string };

/**
 * Key stored inside workbench.colorCustomizations to let us know
 * which color tokens were last written by this extension.
 * This allows safe merging — we only remove OUR old keys, never
 * touching anything the user set manually.
 */
export const MANAGED_KEY = "__matugenBridge";

export interface ManagedMeta {
  /** Color-token keys currently owned by this extension */
  keys: string[];
  /** ISO-8601 timestamp of last apply */
  appliedAt: string;
}
