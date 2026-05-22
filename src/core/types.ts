import type { ParsedShureResponse, ShureFrame } from "../shure/protocol.js";

export const KNOWN_MODELS = ["MXA920", "MXA902", "P300", "genericTcp"] as const;

export type KnownModel = (typeof KNOWN_MODELS)[number];
export type ApiPreference = "auto" | "rest" | "tcp";
export type TlsMode = "verify" | "insecure";
export type TransportKind = "tcp" | "rest" | "systemApi";

export type Capability =
  | "device.info"
  | "device.status"
  | "room.status"
  | "mute.read"
  | "mute.write"
  | "gain.read"
  | "gain.write"
  | "identify.write"
  | "preset.load"
  | "talkerPositions.read"
  | "rawTcp.read"
  | "rawTcp.write"
  | "audio.metering"
  | "wireless.read"
  | "dante.read";

export type DeviceConfig = {
  id: string;
  name: string;
  host: string;
  model?: string;
  room?: string;
  tags: string[];
  preferredApi: ApiPreference;
  tcpPort: number;
  restBaseUrl?: string;
  tls: TlsMode;
};

export type RoomConfig = {
  id: string;
  name: string;
  deviceIds: string[];
  tags: string[];
};

export type SafetyPolicy = {
  allowRawSet: boolean;
  allowDestructive: boolean;
  allowUnknownMutatingCommands: boolean;
};

export type TimeoutConfig = {
  tcpMs: number;
  restMs: number;
  idleMs: number;
};

export type LoggingConfig = {
  level: "silent" | "error" | "warn" | "info" | "debug";
};

export type ShureConfig = {
  devices: DeviceConfig[];
  rooms: RoomConfig[];
  allowedHosts: string[];
  safety: SafetyPolicy;
  timeouts: TimeoutConfig;
  logging: LoggingConfig;
};

export type TransportHealth = {
  transport: TransportKind;
  ok: boolean;
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
};

export type OperationResult<TData = unknown> = {
  ok: boolean;
  operation: string;
  deviceId?: string;
  transport?: TransportKind;
  durationMs?: number;
  data?: TData;
  raw?: string;
  frames?: ShureFrame[];
  warnings: string[];
  remediation: string[];
  error?: {
    code: string;
    message: string;
  };
};

export type TcpCommandData = {
  command: string;
  parsed: ParsedShureResponse;
};

export type DeviceProbe = {
  device: DeviceConfig;
  profile: DeviceProfileSummary;
  model?: string;
  firmwareVersion?: string;
  deviceId?: string;
  serialNumber?: string;
  tcp: TransportHealth;
  rest?: TransportHealth;
  capabilities: Capability[];
  warnings: string[];
};

export type DeviceStatus = {
  device: DeviceConfig;
  profile: DeviceProfileSummary;
  probe: DeviceProbe;
  mute?: string;
  info: Record<string, string | undefined>;
};

export type RoomStatus = {
  room: RoomConfig;
  devices: DeviceStatus[];
  warnings: string[];
};

export type DeviceProfileSummary = {
  id: string;
  model: KnownModel | string;
  displayName: string;
  capabilities: Capability[];
  prefersRest: boolean;
};

export type MuteTarget = "device" | "channel" | "automixer" | "coverageArea" | "postGateChannel";
export type MuteState = "ON" | "OFF" | "TOGGLE";
export type GainTarget = "channel" | "coverageArea";

export type TalkerPosition = {
  lobeId?: number;
  coverageAreaId?: number;
  xCm: number;
  yCm: number;
  zCm: number;
  raw?: unknown;
};

export type AudioLevelEntry = {
  channel: number;
  rawLevel?: string;
  peakDb?: number;
  error?: string;
};

export type DanteStatus = {
  danteEnabled?: string;
  danteDeviceName?: string;
  danteAes67?: string;
  audioIpAddr?: string;
  audioSubnetMask?: string;
  audioGateway?: string;
  controlMacAddr?: string;
};

export type WirelessStatus = {
  channel?: number;
  batteryCharge?: string;
  rfFrequency?: string;
  rfPower?: string;
  rfSignalStrength?: string;
  transmitterType?: string;
};

export type FleetDeviceEntry = {
  id: string;
  name: string;
  model: string;
  room?: string;
  status: "online" | "degraded" | "offline";
  tcpOk: boolean;
  restOk?: boolean;
  tcpLatencyMs?: number;
  restLatencyMs?: number;
  firmwareVersion?: string;
  capabilities: Capability[];
  warnings: string[];
};

export type FleetRoomEntry = {
  id: string;
  name: string;
  allOnline: boolean;
  deviceIds: string[];
};

export type FleetHealth = {
  ok: boolean;
  summary: string;
  onlineCount: number;
  degradedCount: number;
  offlineCount: number;
  totalCount: number;
  durationMs: number;
  devices: FleetDeviceEntry[];
  rooms: FleetRoomEntry[];
};
