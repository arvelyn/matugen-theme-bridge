// src/utils/logger.ts
// Thin wrapper around VS Code OutputChannel so every module
// can log without importing vscode directly.

import * as vscode from "vscode";

type LogLevel = "silent" | "info" | "debug";

const LEVEL_RANK: Record<LogLevel, number> = { silent: 0, info: 1, debug: 2 };

class Logger {
  private channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel("Matugen Bridge");
  }

  private get level(): LogLevel {
    return vscode.workspace
      .getConfiguration("matugenBridge")
      .get<LogLevel>("logLevel", "info");
  }

  private shouldLog(target: LogLevel): boolean {
    return LEVEL_RANK[this.level] >= LEVEL_RANK[target];
  }

  info(msg: string): void {
    if (this.shouldLog("info")) {
      this.channel.appendLine(`[INFO]  ${new Date().toISOString()} ${msg}`);
    }
  }

  debug(msg: string): void {
    if (this.shouldLog("debug")) {
      this.channel.appendLine(`[DEBUG] ${new Date().toISOString()} ${msg}`);
    }
  }

  error(msg: string): void {
    // Errors always log regardless of level
    this.channel.appendLine(`[ERROR] ${new Date().toISOString()} ${msg}`);
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}

// Singleton — import and use anywhere
export const logger = new Logger();
