import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SHURE_PORT } from "../shure/commands.js";
import type {
  ApiPreference,
  DeviceConfig,
  LoggingConfig,
  RoomConfig,
  SafetyPolicy,
  ShureConfig,
  TimeoutConfig,
  TlsMode,
} from "./types.js";

type ConfigFile = Partial<{
  devices: Array<Partial<DeviceConfig> & { port?: number }>;
  rooms: Array<Partial<RoomConfig>>;
  allowedHosts: string[];
  safety: Partial<SafetyPolicy>;
  timeouts: Partial<TimeoutConfig> & { timeoutMs?: number };
  logging: Partial<LoggingConfig>;
}>;

const defaultSafety: SafetyPolicy = {
  allowRawSet: false,
  allowDestructive: false,
  allowUnknownMutatingCommands: false,
};

const defaultTimeouts: TimeoutConfig = {
  tcpMs: 2000,
  restMs: 2500,
  idleMs: 150,
};

const defaultLogging: LoggingConfig = {
  level: "warn",
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ShureConfig {
  const fileConfig = env.SHURE_CONFIG_PATH ? readConfigFile(env.SHURE_CONFIG_PATH) : {};
  const envDevices = parseEnvDevices(env.SHURE_DEVICES, parseInteger(env.SHURE_DEFAULT_PORT, DEFAULT_SHURE_PORT));
  const fileDevices = normalizeDevices(fileConfig.devices ?? [], parseInteger(env.SHURE_DEFAULT_PORT, DEFAULT_SHURE_PORT));
  const devices = envDevices.length > 0 ? envDevices : fileDevices;
  const defaultHost = env.SHURE_DEFAULT_HOST?.trim();

  if (defaultHost && devices.length === 0) {
    devices.push(
      normalizeDevice(
        {
          id: "default",
          name: "Default Shure Device",
          host: defaultHost,
          tcpPort: parseInteger(env.SHURE_DEFAULT_PORT, DEFAULT_SHURE_PORT),
        },
        0,
        parseInteger(env.SHURE_DEFAULT_PORT, DEFAULT_SHURE_PORT),
      ),
    );
  }

  const allowedHosts = unique([
    ...(fileConfig.allowedHosts ?? []),
    ...parseCsv(env.SHURE_ALLOWED_HOSTS),
  ]);

  const safety = {
    ...defaultSafety,
    ...(fileConfig.safety ?? {}),
    allowRawSet: parseBoolean(env.SHURE_ALLOW_RAW_SET, fileConfig.safety?.allowRawSet ?? defaultSafety.allowRawSet),
    allowDestructive: parseBoolean(
      env.SHURE_ALLOW_DESTRUCTIVE,
      fileConfig.safety?.allowDestructive ?? defaultSafety.allowDestructive,
    ),
    allowUnknownMutatingCommands: parseBoolean(
      env.SHURE_ALLOW_UNKNOWN_MUTATING_COMMANDS,
      fileConfig.safety?.allowUnknownMutatingCommands ?? defaultSafety.allowUnknownMutatingCommands,
    ),
  };

  const timeouts = {
    ...defaultTimeouts,
    ...(fileConfig.timeouts ?? {}),
    tcpMs: parseInteger(env.SHURE_TIMEOUT_MS, fileConfig.timeouts?.tcpMs ?? fileConfig.timeouts?.timeoutMs ?? defaultTimeouts.tcpMs),
    restMs: parseInteger(env.SHURE_REST_TIMEOUT_MS, fileConfig.timeouts?.restMs ?? defaultTimeouts.restMs),
    idleMs: parseInteger(env.SHURE_IDLE_MS, fileConfig.timeouts?.idleMs ?? defaultTimeouts.idleMs),
  };

  const logging = {
    ...defaultLogging,
    ...(fileConfig.logging ?? {}),
  };

  return {
    devices,
    rooms: normalizeRooms(fileConfig.rooms ?? [], devices),
    allowedHosts,
    safety,
    timeouts,
    logging,
  };
}

export function resolveDevice(
  config: ShureConfig,
  input: { deviceId?: string; host?: string },
): DeviceConfig {
  const device = input.deviceId
    ? config.devices.find((candidate) => candidate.id === input.deviceId)
    : input.host
      ? config.devices.find((candidate) => candidate.host === input.host)
      : config.devices[0];

  if (!device) {
    throw new Error("Provide a configured deviceId/host or configure at least one Shure device.");
  }

  assertHostAllowed(config, device.host);
  return device;
}

export function resolveRoom(config: ShureConfig, roomIdOrName?: string): RoomConfig {
  const room = roomIdOrName
    ? config.rooms.find((candidate) => candidate.id === roomIdOrName || candidate.name === roomIdOrName)
    : config.rooms[0];

  if (!room) {
    throw new Error("Provide a configured roomId or add rooms to SHURE_CONFIG_PATH.");
  }

  return room;
}

export function assertHostAllowed(config: ShureConfig, host: string): void {
  if (config.allowedHosts.length > 0 && !config.allowedHosts.includes(host)) {
    throw new Error(`Host '${host}' is not in SHURE_ALLOWED_HOSTS/config allowedHosts.`);
  }
}

function readConfigFile(configPath: string): ConfigFile {
  const resolved = path.resolve(configPath);
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("SHURE_CONFIG_PATH must point to a JSON object.");
  }

  return parsed as ConfigFile;
}

function parseEnvDevices(value: string | undefined, defaultPort: number): DeviceConfig[] {
  if (!value?.trim()) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("SHURE_DEVICES must be a JSON array.");
  }

  return normalizeDevices(parsed as Array<Partial<DeviceConfig> & { port?: number }>, defaultPort);
}

function normalizeDevices(devices: Array<Partial<DeviceConfig> & { port?: number }>, defaultPort: number): DeviceConfig[] {
  return devices.map((device, index) => normalizeDevice(device, index, defaultPort));
}

function normalizeDevice(device: Partial<DeviceConfig> & { port?: number }, index: number, defaultPort: number): DeviceConfig {
  const host = requiredString(device.host, `devices[${index}].host`);
  const name = requiredString(device.name ?? device.id ?? host, `devices[${index}].name`);
  const id = sanitizeId(device.id ?? name);
  const tcpPort = normalizePort(device.tcpPort ?? device.port ?? defaultPort, `devices[${index}].tcpPort`);
  const preferredApi = normalizeApiPreference(device.preferredApi ?? "auto");
  const tls = normalizeTlsMode(device.tls ?? inferTlsMode(device.restBaseUrl));

  return {
    id,
    name,
    host,
    model: device.model?.trim(),
    room: device.room?.trim(),
    tags: normalizeTags(device.tags),
    preferredApi,
    tcpPort,
    restBaseUrl: device.restBaseUrl?.trim(),
    tls,
  };
}

function normalizeRooms(rooms: Array<Partial<RoomConfig>>, devices: DeviceConfig[]): RoomConfig[] {
  if (rooms.length > 0) {
    return rooms.map((room, index) => {
      const name = requiredString(room.name ?? room.id, `rooms[${index}].name`);
      return {
        id: sanitizeId(room.id ?? name),
        name,
        deviceIds: Array.isArray(room.deviceIds) ? room.deviceIds.map(String) : [],
        tags: normalizeTags(room.tags),
      };
    });
  }

  const grouped = new Map<string, DeviceConfig[]>();

  for (const device of devices) {
    if (!device.room) {
      continue;
    }

    const roomId = sanitizeId(device.room);
    grouped.set(roomId, [...(grouped.get(roomId) ?? []), device]);
  }

  return [...grouped.entries()].map(([id, groupedDevices]) => ({
    id,
    name: groupedDevices[0].room ?? id,
    deviceIds: groupedDevices.map((device) => device.id),
    tags: [],
  }));
}

function parseCsv(value: string | undefined): string[] {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received '${value}'.`);
  }

  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function normalizePort(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${label} must be an integer from 1 through 65535.`);
  }

  return value;
}

function normalizeApiPreference(value: unknown): ApiPreference {
  if (value === "auto" || value === "rest" || value === "tcp") {
    return value;
  }

  throw new Error("preferredApi must be one of auto, rest, or tcp.");
}

function normalizeTlsMode(value: unknown): TlsMode {
  if (value === "verify" || value === "insecure") {
    return value;
  }

  throw new Error("tls must be one of verify or insecure.");
}

function inferTlsMode(restBaseUrl: string | undefined): TlsMode {
  return restBaseUrl?.startsWith("https://") ? "insecure" : "verify";
}

function normalizeTags(tags: unknown): string[] {
  return Array.isArray(tags)
    ? tags.map(String).map((tag) => tag.trim()).filter(Boolean)
    : [];
}

function sanitizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "device";
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
