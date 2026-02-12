// src/watcher/paletteWatcher.ts
// Watches the palette file for changes using VS Code's FileSystemWatcher.
//
// Why FileSystemWatcher over fs.watch?
//  - Integrated into VS Code's lifecycle (automatically disposed)
//  - Works correctly on all platforms including WSL and remote workspaces
//  - Fires for create/change/delete events separately
//  - No polling — purely event-driven
//
// The watcher is re-created whenever the palette path config changes,
// so users can switch paths live without restarting.

import * as vscode from "vscode";
import * as path from "path";
import { debounce } from "../utils/debounce";
import { logger } from "../utils/logger";

type OnChangeCallback = () => void;

export class PaletteWatcher implements vscode.Disposable {
  private fsWatcher: vscode.FileSystemWatcher | undefined;
  private disposables: vscode.Disposable[] = [];
  private debouncedCallback: OnChangeCallback;
  private currentPath: string = "";

  constructor(private readonly onChange: OnChangeCallback) {
    // The debounced wrapper is built once; its delay is re-read from
    // config on every invocation (config can change without restart)
    this.debouncedCallback = debounce(() => {
      const delayMs = vscode.workspace
        .getConfiguration("matugenBridge")
        .get<number>("debounceMs", 300);
      logger.debug(`Palette change detected — callback executing (debounced at ${delayMs}ms)`);
      this.onChange();
    }, 0); // outer debounce is 0; real delay is applied inside onChange scheduling

    // We rebuild it properly below so debounce delay is respected at construction
    this.debouncedCallback = this.buildDebounced();
  }

  private buildDebounced(): OnChangeCallback {
    const delayMs = vscode.workspace
      .getConfiguration("matugenBridge")
      .get<number>("debounceMs", 300);

    return debounce(() => {
      logger.debug("Palette file change — firing callback.");
      this.onChange();
    }, delayMs);
  }

  /**
   * Start (or restart) watching `palettePath`.
   * Safe to call multiple times — tears down the previous watcher first.
   */
  start(palettePath: string): void {
    this.stop();

    this.currentPath = palettePath;
    this.debouncedCallback = this.buildDebounced();

    // VS Code's FileSystemWatcher accepts a glob pattern.
    // We construct it from the absolute path.
    const dir = path.dirname(palettePath);
    const file = path.basename(palettePath);

    // Glob: watch the exact file inside its directory
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(dir),
      file
    );

    this.fsWatcher = vscode.workspace.createFileSystemWatcher(
      pattern,
      /* ignoreCreateEvents = */ false,
      /* ignoreChangeEvents = */ false,
      /* ignoreDeleteEvents = */ false
    );

    // All three events trigger a re-apply
    this.fsWatcher.onDidCreate(this.handleEvent, this, this.disposables);
    this.fsWatcher.onDidChange(this.handleEvent, this, this.disposables);
    this.fsWatcher.onDidDelete(this.handleDelete, this, this.disposables);
    this.disposables.push(this.fsWatcher);

    logger.info(`Watching palette file: ${palettePath}`);
  }

  private handleEvent = (_uri: vscode.Uri): void => {
    logger.debug(`FileSystemWatcher: change/create event`);
    this.debouncedCallback();
  };

  private handleDelete = (_uri: vscode.Uri): void => {
    logger.info("Palette file deleted — colors will remain until a new file appears.");
    // Intentionally do NOT clear colors on delete.
    // The colors already applied stay visible. If/when the file
    // reappears, the create event will re-apply fresh colors.
  };

  /** Tear down current watcher without losing the path. */
  stop(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.fsWatcher = undefined;
  }

  get watchedPath(): string {
    return this.currentPath;
  }

  dispose(): void {
    this.stop();
  }
}
