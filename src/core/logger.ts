import type { LoggingConfig } from "./types.js";

const LEVEL_VALUES = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 } as const;
type LogLevel = keyof typeof LEVEL_VALUES;

export class Logger {
  private readonly threshold: number;

  constructor(config: LoggingConfig) {
    this.threshold = LEVEL_VALUES[config.level as LogLevel] ?? 0;
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write("error", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write("warn", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write("info", message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write("debug", message, context);
  }

  private write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_VALUES[level] > this.threshold) return;
    process.stderr.write(
      JSON.stringify({ ts: new Date().toISOString(), level, msg: message, ...context }) + "\n",
    );
  }
}
