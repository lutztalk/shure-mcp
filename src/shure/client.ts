import net from "node:net";
import { DEFAULT_SHURE_PORT } from "./commands.js";
import { normalizeCommand, parseShureResponse, type ParsedShureResponse } from "./protocol.js";

export type SendCommandOptions = {
  host: string;
  port?: number;
  command: string;
  timeoutMs?: number;
  idleMs?: number;
  waitForResponse?: boolean;
};

export type ShureCommandResult = {
  host: string;
  port: number;
  command: string;
  raw: string;
  parsed: ParsedShureResponse;
  durationMs: number;
};

export async function sendShureCommand(options: SendCommandOptions): Promise<ShureCommandResult> {
  const command = normalizeCommand(options.command);
  const port = options.port ?? DEFAULT_SHURE_PORT;
  const timeoutMs = options.timeoutMs ?? 2000;
  const idleMs = options.idleMs ?? 150;
  const waitForResponse = options.waitForResponse ?? true;
  const startedAt = Date.now();

  validateNetworkOptions(options.host, port, timeoutMs, idleMs);

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const chunks: Buffer[] = [];
    let settled = false;
    let idleTimer: NodeJS.Timeout | undefined;

    const settle = (raw: string) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(idleTimer);
      socket.destroy();
      resolve({
        host: options.host,
        port,
        command,
        raw,
        parsed: parseShureResponse(raw),
        durationMs: Date.now() - startedAt,
      });
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(idleTimer);
      socket.destroy();
      reject(error);
    };

    const timeoutTimer = setTimeout(() => {
      const raw = Buffer.concat(chunks).toString("ascii");

      if (raw.length > 0) {
        settle(raw);
        return;
      }

      fail(new Error(`Timed out waiting for ${options.host}:${port} to respond to ${command}.`));
    }, timeoutMs);

    socket.once("error", fail);
    socket.once("connect", () => {
      socket.write(command, "ascii", (error) => {
        if (error) {
          fail(error);
          return;
        }

        if (!waitForResponse) {
          idleTimer = setTimeout(() => settle(""), idleMs);
        }
      });
    });

    socket.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "ascii") : chunk);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => settle(Buffer.concat(chunks).toString("ascii")), idleMs);
    });

    socket.once("close", () => {
      if (settled) {
        return;
      }

      const raw = Buffer.concat(chunks).toString("ascii");

      if (raw.length > 0 || !waitForResponse) {
        settle(raw);
      }
    });

    socket.connect(port, options.host);
  });
}

function validateNetworkOptions(host: string, port: number, timeoutMs: number, idleMs: number): void {
  if (!host.trim()) {
    throw new Error("Host is required.");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Port must be an integer from 1 through 65535.");
  }

  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new Error("timeoutMs must be an integer from 100 through 30000.");
  }

  if (!Number.isInteger(idleMs) || idleMs < 25 || idleMs > timeoutMs) {
    throw new Error("idleMs must be an integer from 25 through timeoutMs.");
  }
}
