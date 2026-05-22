import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig } from "./core/config.js";
import type { ShureConfig } from "./core/types.js";
import { DeviceService } from "./services/device-service.js";

const selectorShape = {
  deviceId: z.string().min(1).optional().describe("Configured device id. Preferred over host."),
  host: z.string().min(1).optional().describe("Device host/IP. Must match configured device and allowlist."),
};

const muteTargetSchema = z.enum(["device", "channel", "automixer", "coverageArea", "postGateChannel"]);
const muteStateSchema = z.enum(["ON", "OFF", "TOGGLE"]);
const gainTargetSchema = z.enum(["channel", "coverageArea"]);

export function createServer(config: ShureConfig = loadConfig()): McpServer {
  const service = new DeviceService(config);
  const server = new McpServer(
    {
      name: "shure-mcp",
      version: "1.0.0",
    },
    {
      instructions:
        "Use this server for Shure room operations and fleet monitoring. Prefer intent-shaped tools. Raw TCP commands are guarded by safety policy and are for documented Shure command strings only.",
    },
  );

  registerResources(server, service);
  registerPrompts(server);
  registerTools(server, service);
  registerDeprecatedAliases(server, service);

  return server;
}

function registerResources(server: McpServer, service: DeviceService): void {
  server.registerResource(
    "configured-devices",
    "shure://devices",
    {
      title: "Configured Shure Devices",
      description: "Configured device inventory with profile summaries.",
      mimeType: "application/json",
    },
    async () => jsonResource("shure://devices", service.listDevices()),
  );

  server.registerResource(
    "room",
    new ResourceTemplate("shure://rooms/{roomId}", {
      list: async () => ({
        resources: service.listRooms().map((room) => ({
          uri: `shure://rooms/${room.id}`,
          name: room.id,
          title: room.name,
          mimeType: "application/json",
        })),
      }),
      complete: {
        roomId: (value) => service.listRooms().map((room) => room.id).filter((id) => id.startsWith(value)),
      },
    }),
    {
      title: "Shure Room",
      description: "Configured room definition by room id.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const roomId = String(variables.roomId);
      const room = service.listRooms().find((candidate) => candidate.id === roomId || candidate.name === roomId);
      return jsonResource(uri.href, room ?? { error: `Room '${roomId}' is not configured.` });
    },
  );

  server.registerResource(
    "device-capabilities",
    new ResourceTemplate("shure://devices/{deviceId}/capabilities", {
      list: async () => ({
        resources: service.listDevices().map(({ device }) => ({
          uri: `shure://devices/${device.id}/capabilities`,
          name: `${device.id}-capabilities`,
          title: `${device.name} Capabilities`,
          mimeType: "application/json",
        })),
      }),
      complete: {
        deviceId: (value) => service.listDevices().map(({ device }) => device.id).filter((id) => id.startsWith(value)),
      },
    }),
    {
      title: "Shure Device Capabilities",
      description: "Profile-derived capabilities for a configured Shure device.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const deviceId = String(variables.deviceId);
      const item = service.listDevices().find(({ device }) => device.id === deviceId);
      return jsonResource(uri.href, item ?? { error: `Device '${deviceId}' is not configured.` });
    },
  );

  server.registerResource(
    "profile",
    new ResourceTemplate("shure://profiles/{model}", {
      list: async () => ({
        resources: service.listProfiles().map((profile) => ({
          uri: `shure://profiles/${profile.model}`,
          name: String(profile.model),
          title: profile.displayName,
          mimeType: "application/json",
        })),
      }),
      complete: {
        model: (value) =>
          service
            .listProfiles()
            .map((profile) => String(profile.model))
            .filter((model) => model.toLowerCase().startsWith(value.toLowerCase())),
      },
    }),
    {
      title: "Shure Device Profile",
      description: "Built-in Shure device profile metadata.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const model = String(variables.model).toUpperCase();
      const profile = service.listProfiles().find((candidate) => String(candidate.model).toUpperCase() === model);
      return jsonResource(uri.href, profile ?? { error: `Profile '${model}' is not built in.` });
    },
  );
}

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "shure_room_health_check",
    {
      title: "Shure Room Health Check",
      description: "Guide an operator through a full Shure room status review.",
      argsSchema: { roomId: z.string().optional() },
    },
    ({ roomId }) => promptText(`Run a Shure room health check${roomId ? ` for room '${roomId}'` : ""}. Use shure_get_room_status, summarize device health, call out failed transports, and recommend concrete next steps without changing room state.`),
  );

  server.registerPrompt(
    "shure_mute_sync_diagnosis",
    {
      title: "Shure Mute Sync Diagnosis",
      description: "Diagnose mute sync across processors, MXA microphones, and conferencing software.",
      argsSchema: { roomId: z.string().optional() },
    },
    ({ roomId }) => promptText(`Diagnose Shure mute sync${roomId ? ` for room '${roomId}'` : ""}. Check room/device status, identify the processor/microphone roles, prefer P300/processor automixer mute state for system mute, and avoid source-muting microphones unless explicitly asked.`),
  );

  server.registerPrompt(
    "shure_camera_tracking_setup",
    {
      title: "Shure Camera Tracking Setup",
      description: "Collect MXA talker position readiness and camera-tracking context.",
      argsSchema: { deviceId: z.string().optional() },
    },
    ({ deviceId }) => promptText(`Assess Shure camera-tracking readiness${deviceId ? ` for device '${deviceId}'` : ""}. Probe the MXA device, try shure_get_talker_positions if REST is available, and explain REST/TCP requirements for talker-position workflows.`),
  );

  server.registerPrompt(
    "shure_safe_tcp_command",
    {
      title: "Safe Shure TCP Command",
      description: "Use a documented command string with guarded safety checks.",
      argsSchema: { command: z.string(), deviceId: z.string().optional() },
    },
    ({ command, deviceId }) => promptText(`Evaluate and, if safe, send this documented Shure TCP command: ${command}${deviceId ? ` to device '${deviceId}'` : ""}. Prefer read-only GET commands. If the safety policy blocks it, explain why and suggest the equivalent typed tool when one exists.`),
  );

  server.registerPrompt(
    "shure_fleet_briefing",
    {
      title: "Shure Fleet Briefing",
      description: "Generate a concise executive-ready fleet health briefing across all configured rooms and devices.",
      argsSchema: {},
    },
    () =>
      promptText(
        `Generate a concise fleet health briefing for all configured Shure devices. Call shure_fleet_health first, then summarize: overall status, any offline or degraded devices, room-by-room health, and specific remediation steps for any issues. Format as a clear, professional summary suitable for a meeting briefing.`,
      ),
  );

  server.registerPrompt(
    "shure_wireless_readiness",
    {
      title: "Shure Wireless Readiness Check",
      description: "Check battery levels and RF status across all configured wireless receivers before an event.",
      argsSchema: { roomId: z.string().optional() },
    },
    ({ roomId }) =>
      promptText(
        `Run a wireless readiness check${roomId ? ` for room '${roomId}'` : " across all devices"}. Use shure_list_devices to find wireless receivers (QLX-D, ULX-D, Axient Digital), call shure_get_wireless_status for each, and flag any transmitters with battery below 50% or poor signal strength. Recommend replacements or frequency changes if needed.`,
      ),
  );
}

function registerTools(server: McpServer, service: DeviceService): void {
  server.registerTool(
    "shure_list_devices",
    {
      title: "List Shure devices",
      description: "List configured Shure devices, rooms, profiles, and safety posture.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () =>
      textResult({
        devices: service.listDevices(),
        rooms: service.listRooms(),
        safety: service.config.safety,
      }),
  );

  server.registerTool(
    "shure_probe_device",
    {
      title: "Probe Shure device",
      description: "Probe TCP/REST health and profile capabilities for a configured Shure device.",
      inputSchema: selectorShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => textResult(await service.probeDevice(args)),
  );

  server.registerTool(
    "shure_get_device_status",
    {
      title: "Get Shure device status",
      description: "Get normalized status for a configured Shure device.",
      inputSchema: selectorShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => textResult(await service.getDeviceStatus(args)),
  );

  server.registerTool(
    "shure_get_room_status",
    {
      title: "Get Shure room status",
      description: "Get normalized status for all devices in a configured room.",
      inputSchema: { roomId: z.string().min(1).optional() },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ roomId }) => textResult(await service.getRoomStatus(roomId)),
  );

  server.registerTool(
    "shure_set_mute",
    {
      title: "Set Shure mute",
      description: "Mute, unmute, or toggle a device/channel/automixer/coverage area using guarded typed controls.",
      inputSchema: {
        ...selectorShape,
        target: muteTargetSchema,
        state: muteStateSchema,
        index: z.number().int().min(0).max(99).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ target, state, index, ...selector }) => textResult(await service.setMute(selector, { target, state, index })),
  );

  server.registerTool(
    "shure_set_gain",
    {
      title: "Set Shure gain",
      description: "Set channel or coverage-area gain in dB from -110 through +30.",
      inputSchema: {
        ...selectorShape,
        target: gainTargetSchema,
        index: z.number().int().min(0).max(99),
        gainDb: z.number().min(-110).max(30),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ target, index, gainDb, ...selector }) => textResult(await service.setGain(selector, { target, index, gainDb })),
  );

  server.registerTool(
    "shure_identify_device",
    {
      title: "Identify Shure device",
      description: "Turn device identify/flash LED on or off using guarded typed controls.",
      inputSchema: {
        ...selectorShape,
        state: z.enum(["ON", "OFF"]),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ state, ...selector }) => textResult(await service.identifyDevice(selector, state)),
  );

  server.registerTool(
    "shure_load_preset",
    {
      title: "Load Shure preset",
      description: "Load preset 1-10 using REST when available, otherwise TCP command strings.",
      inputSchema: {
        ...selectorShape,
        preset: z.number().int().min(1).max(10),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ preset, ...selector }) => textResult(await service.loadPreset(selector, preset)),
  );

  server.registerTool(
    "shure_get_talker_positions",
    {
      title: "Get Shure talker positions",
      description: "Read active talker positions from MXA REST-capable devices.",
      inputSchema: selectorShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => textResult(await service.getTalkerPositions(args)),
  );

  server.registerTool(
    "shure_send_tcp_command",
    {
      title: "Send guarded Shure TCP command",
      description: "Send a documented Shure command string. Raw SET/destructive commands are blocked unless explicitly enabled.",
      inputSchema: {
        ...selectorShape,
        command: z.string().min(7),
        waitForResponse: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ command, waitForResponse, ...selector }) =>
      textResult(await service.sendTcpCommand(selector, command, { waitForResponse })),
  );

  server.registerTool(
    "shure_fleet_health",
    {
      title: "Shure fleet health",
      description:
        "Probe all configured Shure devices in parallel and return a concise fleet health dashboard: TCP/REST status, latency, firmware, capabilities, and a per-room summary.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => textResult(await service.getFleetHealth()),
  );

  server.registerTool(
    "shure_get_audio_levels",
    {
      title: "Get Shure audio levels",
      description: "Read peak audio input levels (in dBFS) for specified channels on a Shure device using AUDIO_IN_PEAK_LEVEL.",
      inputSchema: {
        ...selectorShape,
        channels: z
          .array(z.number().int().min(1).max(99))
          .min(1)
          .max(16)
          .describe("1-based channel indices to read (e.g. [1,2,3,4])."),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ channels, ...selector }) => textResult(await service.getAudioLevels(selector, channels)),
  );

  server.registerTool(
    "shure_get_dante_status",
    {
      title: "Get Shure Dante status",
      description:
        "Read Dante and AES67 audio network status from a Shure device: enabled state, device name, IP addressing, MAC address, and AES67 mode.",
      inputSchema: selectorShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => textResult(await service.getDanteStatus(args)),
  );

  server.registerTool(
    "shure_get_wireless_status",
    {
      title: "Get Shure wireless status",
      description:
        "Read wireless receiver status for Shure QLX-D, ULX-D, and Axient Digital receivers: battery charge, RF frequency, signal strength, TX power, and transmitter type.",
      inputSchema: {
        ...selectorShape,
        channel: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe("Receiver channel index (1–4). Defaults to channel 1 if omitted."),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ channel, ...selector }) => textResult(await service.getWirelessStatus(selector, channel)),
  );
}

function registerDeprecatedAliases(server: McpServer, service: DeviceService): void {
  server.registerTool(
    "shure_list_configured_devices",
    {
      title: "Deprecated: list configured devices",
      description: "Deprecated alias for shure_list_devices.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => textResult({ devices: service.listDevices(), rooms: service.listRooms(), safety: service.config.safety }),
  );

  server.registerTool(
    "shure_send_command",
    {
      title: "Deprecated: send command",
      description: "Deprecated alias for shure_send_tcp_command.",
      inputSchema: { ...selectorShape, command: z.string().min(7), waitForResponse: z.boolean().optional() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ command, waitForResponse, ...selector }) =>
      textResult(await service.sendTcpCommand(selector, command, { waitForResponse })),
  );

  server.registerTool(
    "shure_get_device_info",
    {
      title: "Deprecated: get device info",
      description: "Deprecated alias for shure_get_device_status.",
      inputSchema: selectorShape,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => textResult(await service.getDeviceStatus(args)),
  );

  server.registerTool(
    "shure_get_mute",
    {
      title: "Deprecated: get mute",
      description: "Deprecated compatibility tool.",
      inputSchema: {
        ...selectorShape,
        target: muteTargetSchema,
        index: z.number().int().min(0).max(99).optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ target, index, ...selector }) => textResult(await service.getMute(selector, { target, index })),
  );

  server.registerTool(
    "shure_get_audio_gain",
    {
      title: "Deprecated: get audio gain",
      description: "Deprecated compatibility tool.",
      inputSchema: {
        ...selectorShape,
        target: gainTargetSchema,
        index: z.number().int().min(0).max(99),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ target, index, ...selector }) => textResult(await service.getGain(selector, { target, index })),
  );

  server.registerTool(
    "shure_set_audio_gain",
    {
      title: "Deprecated: set audio gain",
      description: "Deprecated alias for shure_set_gain.",
      inputSchema: {
        ...selectorShape,
        target: gainTargetSchema,
        index: z.number().int().min(0).max(99),
        gainDb: z.number().min(-110).max(30),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ target, index, gainDb, ...selector }) => textResult(await service.setGain(selector, { target, index, gainDb })),
  );
}

function textResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function jsonResource(uri: string, payload: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function promptText(text: string) {
  return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text,
        },
      },
    ],
  };
}
