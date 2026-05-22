import type { OperationResult, TransportKind } from "./types.js";

export function okResult<TData>(
  operation: string,
  options: {
    deviceId?: string;
    transport?: TransportKind;
    durationMs?: number;
    data?: TData;
    raw?: string;
    frames?: OperationResult["frames"];
    warnings?: string[];
    remediation?: string[];
  } = {},
): OperationResult<TData> {
  return {
    ok: true,
    operation,
    deviceId: options.deviceId,
    transport: options.transport,
    durationMs: options.durationMs,
    data: options.data,
    raw: options.raw,
    frames: options.frames,
    warnings: options.warnings ?? [],
    remediation: options.remediation ?? [],
  };
}

export function errorResult<TData = unknown>(
  operation: string,
  code: string,
  message: string,
  options: {
    deviceId?: string;
    transport?: TransportKind;
    durationMs?: number;
    raw?: string;
    frames?: OperationResult["frames"];
    warnings?: string[];
    remediation?: string[];
  } = {},
): OperationResult<TData> {
  return {
    ok: false,
    operation,
    deviceId: options.deviceId,
    transport: options.transport,
    durationMs: options.durationMs,
    raw: options.raw,
    frames: options.frames,
    warnings: options.warnings ?? [],
    remediation: options.remediation ?? [],
    error: { code, message },
  };
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
