import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import type { DeviceConfig, ShureConfig, TalkerPosition, TransportHealth } from "../core/types.js";

type JsonValue = Record<string, unknown> | unknown[];

export type RestResponse<T = unknown> = {
  status: number;
  url: string;
  data: T;
  durationMs: number;
};

const statusPaths = ["/api/v1/device", "/api/v1/status", "/api/device", "/device", "/status"];
const mutePaths = ["/api/v1/mute", "/api/v1/audio/mute", "/api/v1/device/mute"];
const presetPaths = ["/api/v1/presets/current", "/api/v1/preset", "/api/v1/presets/load"];
const talkerPositionPaths = [
  "/api/v1/talker-positions",
  "/api/v1/coverage/talker-positions",
  "/api/v1/camera/talker-positions",
];

export class MxaRestTransport {
  readonly kind = "rest" as const;

  constructor(private readonly config: ShureConfig) {}

  async probe(device: DeviceConfig): Promise<TransportHealth> {
    const startedAt = Date.now();

    try {
      const response = await this.tryPaths(device, "GET", statusPaths);
      return {
        transport: "rest",
        ok: true,
        latencyMs: Date.now() - startedAt,
        message: `REST responded at ${response.url}`,
        details: isRecord(response.data) ? response.data : { response: response.data },
      };
    } catch (error) {
      return {
        transport: "rest",
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getStatus(device: DeviceConfig): Promise<RestResponse<Record<string, unknown>>> {
    const response = await this.tryPaths(device, "GET", statusPaths);
    return { ...response, data: isRecord(response.data) ? response.data : { value: response.data } };
  }

  async getMute(device: DeviceConfig): Promise<RestResponse<{ state?: string; raw: unknown }>> {
    const response = await this.tryPaths(device, "GET", mutePaths);
    return {
      ...response,
      data: {
        state: normalizeMuteState(response.data),
        raw: response.data,
      },
    };
  }

  async setMute(device: DeviceConfig, state: "ON" | "OFF" | "TOGGLE"): Promise<RestResponse<{ state?: string; raw: unknown }>> {
    const resolvedState = state === "TOGGLE" ? invertMuteState((await this.getMute(device)).data.state) : state;
    const body = { muted: resolvedState === "ON", state: resolvedState };
    const response = await this.tryPaths(device, "PATCH", mutePaths, body, ["PATCH", "PUT", "POST"]);

    return {
      ...response,
      data: {
        state: normalizeMuteState(response.data) ?? resolvedState,
        raw: response.data,
      },
    };
  }

  async loadPreset(device: DeviceConfig, preset: number): Promise<RestResponse<{ preset: number; raw: unknown }>> {
    const response = await this.tryPaths(device, "POST", presetPaths, { preset }, ["POST", "PUT", "PATCH"]);
    return {
      ...response,
      data: {
        preset,
        raw: response.data,
      },
    };
  }

  async getTalkerPositions(device: DeviceConfig): Promise<RestResponse<{ positions: TalkerPosition[]; raw: unknown }>> {
    const response = await this.tryPaths(device, "GET", talkerPositionPaths);
    return {
      ...response,
      data: {
        positions: normalizeTalkerPositions(response.data),
        raw: response.data,
      },
    };
  }

  private async tryPaths(
    device: DeviceConfig,
    method: string,
    paths: string[],
    body?: JsonValue,
    methodFallbacks: string[] = [method],
  ): Promise<RestResponse> {
    const errors: string[] = [];

    for (const candidateMethod of methodFallbacks) {
      for (const candidatePath of paths) {
        try {
          return await this.requestJson(device, candidateMethod, candidatePath, body);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }

    throw new Error(`No REST endpoint responded successfully. Tried ${paths.join(", ")}. ${errors[0] ?? ""}`.trim());
  }

  private requestJson(device: DeviceConfig, method: string, requestPath: string, body?: JsonValue): Promise<RestResponse> {
    const startedAt = Date.now();
    const baseUrl = device.restBaseUrl ?? `https://${device.host}`;
    const url = new URL(requestPath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;
    const rejectUnauthorized = device.restBaseUrl === undefined ? false : device.tls !== "insecure";

    return new Promise((resolve, reject) => {
      const request = client.request(
        url,
        {
          method,
          timeout: this.config.timeouts.restMs,
          rejectUnauthorized,
          headers: {
            Accept: "application/json",
            ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];

          response.on("data", (chunk) => chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
          response.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8").trim();
            const status = response.statusCode ?? 0;

            if (status < 200 || status >= 300) {
              reject(new Error(`${method} ${url.href} returned HTTP ${status}`));
              return;
            }

            try {
              resolve({
                status,
                url: url.href,
                data: text ? JSON.parse(text) : {},
                durationMs: Date.now() - startedAt,
              });
            } catch {
              resolve({
                status,
                url: url.href,
                data: { text },
                durationMs: Date.now() - startedAt,
              });
            }
          });
        },
      );

      request.on("timeout", () => {
        request.destroy(new Error(`${method} ${url.href} timed out after ${this.config.timeouts.restMs}ms`));
      });
      request.on("error", reject);

      if (payload) {
        request.write(payload);
      }

      request.end();
    });
  }
}

function normalizeMuteState(value: unknown): string | undefined {
  const candidates = collectValues(value, ["muted", "mute", "state", "status", "deviceAudioMute", "device_audio_mute"]);
  const first = candidates[0];

  if (typeof first === "boolean") {
    return first ? "ON" : "OFF";
  }

  if (typeof first === "string") {
    const upper = first.toUpperCase();
    if (upper === "ON" || upper === "MUTED" || upper === "TRUE") {
      return "ON";
    }
    if (upper === "OFF" || upper === "UNMUTED" || upper === "FALSE") {
      return "OFF";
    }
  }

  return undefined;
}

function invertMuteState(state: string | undefined): "ON" | "OFF" {
  return state === "ON" ? "OFF" : "ON";
}

function normalizeTalkerPositions(value: unknown): TalkerPosition[] {
  const candidates = collectValues(value, ["positions", "talkerPositions", "talkers"]);
  const rawPositions = Array.isArray(value) ? value : candidates.find(Array.isArray);

  if (!Array.isArray(rawPositions)) {
    return [];
  }

  return rawPositions
    .map((entry): TalkerPosition | undefined => {
      if (!isRecord(entry)) {
        return undefined;
      }

      const x = Number(entry.xCm ?? entry.x ?? entry.X);
      const y = Number(entry.yCm ?? entry.y ?? entry.Y);
      const z = Number(entry.zCm ?? entry.z ?? entry.Z);

      if (![x, y, z].every(Number.isFinite)) {
        return undefined;
      }

      const position: TalkerPosition = {
        xCm: x,
        yCm: y,
        zCm: z,
        raw: entry,
      };

      const lobeId = optionalNumber(entry.lobeId ?? entry.lobe);
      const coverageAreaId = optionalNumber(entry.coverageAreaId ?? entry.coverageArea);

      if (lobeId !== undefined) {
        position.lobeId = lobeId;
      }

      if (coverageAreaId !== undefined) {
        position.coverageAreaId = coverageAreaId;
      }

      return position;
    })
    .filter((entry): entry is TalkerPosition => entry !== undefined);
}

function collectValues(value: unknown, keys: string[]): unknown[] {
  if (!isRecord(value)) {
    return [];
  }

  return keys.flatMap((key) => (key in value ? [value[key]] : []));
}

function optionalNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
