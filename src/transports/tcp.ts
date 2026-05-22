import { sendShureCommand, type ShureCommandResult } from "../shure/client.js";
import { deviceInfoCommands } from "../shure/commands.js";
import { firstValueForParameter } from "../shure/protocol.js";
import type { DeviceConfig, ShureConfig, TransportHealth } from "../core/types.js";

export type TcpTransportOptions = {
  config: ShureConfig;
};

export class TcpCommandTransport {
  readonly kind = "tcp" as const;
  private queues = new Map<string, Promise<unknown>>();

  constructor(private readonly options: TcpTransportOptions) {}

  async send(
    device: DeviceConfig,
    command: string,
    options: { waitForResponse?: boolean; timeoutMs?: number; idleMs?: number } = {},
  ): Promise<ShureCommandResult> {
    return this.enqueue(device, () =>
      sendShureCommand({
        host: device.host,
        port: device.tcpPort,
        command,
        timeoutMs: options.timeoutMs ?? this.options.config.timeouts.tcpMs,
        idleMs: options.idleMs ?? this.options.config.timeouts.idleMs,
        waitForResponse: options.waitForResponse,
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
