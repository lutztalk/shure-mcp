import type { DeviceConfig, TransportHealth } from "../core/types.js";

export interface SystemApiTransport {
  readonly kind: "systemApi";
  probe(device: DeviceConfig): Promise<TransportHealth>;
}

export class UnimplementedSystemApiTransport implements SystemApiTransport {
  readonly kind = "systemApi" as const;

  async probe(): Promise<TransportHealth> {
    return {
      transport: "systemApi",
      ok: false,
      message: "System API transport is reserved for Shure System API Server integration.",
    };
  }
}
