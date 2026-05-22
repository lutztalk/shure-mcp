import net from "node:net";
import { deviceInfoCommands } from "../shure/commands.js";
import { normalizeCommand, parseShureResponse } from "../shure/protocol.js";
import { firstValueForParameter } from "../shure/protocol.js";
import type { DeviceConfig, ShureConfig, TransportHealth } from "../core/types.js";
import type { ShureCommandResult } from "../shure/client.js";

type PoolEntry = {
  socket: net.Socket;
  idleTimer?: NodeJS.Timeout;
};

export type TcpTransportOptions = {
  config: ShureConfig;
};

export class TcpCommandTransport {
  readonly kind = "tcp" as const;
  private queues = new Map<string, Promise<unknown>>();
  private pool = new Map<string, PoolEntry>();
  private readonly poolIdleMs: number;

  constructor(private readonly options: TcpTransportOptions) {
    this.poolIdleMs = Math.max(options.config.timeouts.tcpMs * 15, 30_000);
  }

  async send(
    device: DeviceConfig,
    command: string,
    options: { waitForResponse?: boolean; timeoutMs?: number; idleMs?: number } = {},
  ): Promise<ShureCommandResult> {
    return this.enqueue(device, () =>
      this.sendWithPool(device, command, {
        timeoutMs: options.timeoutMs ?? this.options.config.timeouts.tcpMs,
        idleMs: options.idleMs ?? this.options.config.timeouts.idleMs,
        waitForResponse: options.waitForResponse ?? true,
      }),
    );
  }

  async probe(device: DeviceConfig): Promise<TransportHealth> {
    const startedAt = Date.now();

    try {
      const result = await this.send(device, deviceInfoCommands.model);
      const model = firstValueForParameter(result.parsed, "MODEL");

      return {
        transport: "tcp",
        ok: result.parsed.frames.length > 0 && !result.parsed.frames.some((frame) => frame.isError),
        latencyMs: Date.now() - startedAt,
        message: model ? `Responded as ${model.trim()}` : "TCP command-string response received.",
      };
    } catch (error) {
      return {
        transport: "tcp",
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  destroy(): void {
    for (const [, entry] of this.pool) {
      clearTimeout(entry.idleTimer);
      entry.socket.destroy();
    }
    this.pool.clear();
  }

  private poolKey(device: DeviceConfig): string {
    return `${device.host}:${device.tcpPort}`;
  }

  private evictSocket(key: string): void {
    const entry = this.pool.get(key);
    if (entry) {
      clearTimeout(entry.idleTimer);
      if (!entry.socket.destroyed) {
        entry.socket.destroy();
      }
      this.pool.delete(key);
    }
  }

  private async getOrCreateSocket(device: DeviceConfig, timeoutMs: number): Promise<net.Socket> {
    const key = this.poolKey(device);
    const entry = this.pool.get(key);

    if (entry) {
      clearTimeout(entry.idleTimer);
      if (!entry.socket.destroyed && entry.socket.writable) {
        return entry.socket;
      }
      this.evictSocket(key);
    }

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`TCP connection to ${device.host}:${device.tcpPort} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      socket.once("connect", () => {
        clearTimeout(timer);
        socket.setKeepAlive(true, 10_000);
        socket.once("close", () => this.evictSocket(key));
        socket.once("error", () => this.evictSocket(key));
        this.pool.set(key, { socket });
        resolve(socket);
      });

      socket.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      socket.connect(device.tcpPort, device.host);
    });
  }

  private async sendWithPool(
    device: DeviceConfig,
    command: string,
    options: { timeoutMs: number; idleMs: number; waitForResponse: boolean },
  ): Promise<ShureCommandResult> {
    const key = this.poolKey(device);
    const startedAt = Date.now();
    const normalizedCmd = normalizeCommand(command);

    let socket: net.Socket;
    try {
      socket = await this.getOrCreateSocket(device, options.timeoutMs);
    } catch (error) {
      throw error;
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let idleTimer: NodeJS.Timeout | undefined;
      let settled = false;

      const cleanup = () => {
        socket.removeListener("data", onData);
        socket.removeListener("error", onCommandError);
      };

      const settle = (raw: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(overallTimer);
        clearTimeout(idleTimer);
        cleanup();
        const entry = this.pool.get(key);
        if (entry?.socket === socket) {
          clearTimeout(entry.idleTimer);
          entry.idleTimer = setTimeout(() => this.evictSocket(key), this.poolIdleMs);
        }
        resolve({
          host: device.host,
          port: device.tcpPort,
          command: normalizedCmd,
          raw,
          parsed: parseShureResponse(raw),
          durationMs: Date.now() - startedAt,
        });
      };

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(overallTimer);
        clearTimeout(idleTimer);
        cleanup();
        this.evictSocket(key);
        reject(err);
      };

      const onData = (chunk: Buffer | string) => {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "ascii") : chunk);
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => settle(Buffer.concat(chunks).toString("ascii")), options.idleMs);
      };

      const onCommandError = (err: Error) => fail(err);

      const overallTimer = setTimeout(() => {
        const raw = Buffer.concat(chunks).toString("ascii");
        if (raw.length > 0) {
          settle(raw);
          return;
        }
        fail(
          new Error(
            `Timed out waiting for ${device.host}:${device.tcpPort} to respond to ${normalizedCmd} after ${options.timeoutMs}ms.`,
          ),
        );
      }, options.timeoutMs);

      socket.on("data", onData);
      socket.on("error", onCommandError);

      socket.write(normalizedCmd, "ascii", (err) => {
        if (err) {
          fail(err);
          return;
        }
        if (!options.waitForResponse) {
          idleTimer = setTimeout(() => settle(""), options.idleMs);
        }
      });
    });
  }

  private async enqueue<T>(device: DeviceConfig, task: () => Promise<T>): Promise<T> {
    const key = device.id;
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.queues.set(
      key,
      next.finally(() => {
        if (this.queues.get(key) === next) {
          this.queues.delete(key);
        }
      }),
    );

    return next;
  }
}
