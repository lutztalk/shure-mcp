import {
  buildGetGainCommand,
  buildGetMuteCommand,
  buildIdentifyCommand,
  buildLoadPresetCommand,
  buildSetGainCommand,
  buildSetMuteCommand,
  deviceInfoCommands,
  rawGainToDb,
  type GainTarget as LegacyGainTarget,
  type MuteTarget as LegacyMuteTarget,
} from "../shure/commands.js";
import { firstValueForParameter } from "../shure/protocol.js";
import { resolveDevice, resolveRoom } from "../core/config.js";
import { errorResult, okResult, toErrorMessage } from "../core/result.js";
import { assertTypedWriteAllowed, evaluateRawTcpCommand } from "../core/safety.js";
import type {
  DeviceConfig,
  DeviceProbe,
  DeviceStatus,
  GainTarget,
  MuteState,
  MuteTarget,
  OperationResult,
  RoomStatus,
  ShureConfig,
  TalkerPosition,
  TransportHealth,
} from "../core/types.js";
import { listProfiles, selectProfile, summarizeProfile } from "../profiles/device-profile.js";
import { MxaRestTransport } from "../transports/rest.js";
import { TcpCommandTransport } from "../transports/tcp.js";

export type DeviceSelector = {
  deviceId?: string;
  host?: string;
};

export class DeviceService {
  readonly tcp: TcpCommandTransport;
  readonly rest: MxaRestTransport;

  constructor(readonly config: ShureConfig, transports?: { tcp?: TcpCommandTransport; rest?: MxaRestTransport }) {
    this.tcp = transports?.tcp ?? new TcpCommandTransport({ config });
    this.rest = transports?.rest ?? new MxaRestTransport(config);
  }

  listDevices(): Array<{ device: DeviceConfig; profile: ReturnType<typeof summarizeProfile> }> {
    return this.config.devices.map((device) => ({
      device,
      profile: summarizeProfile(selectProfile(device)),
    }));
  }

  listRooms() {
    return this.config.rooms;
  }

  listProfiles() {
    return listProfiles();
  }

  async probeDevice(selector: DeviceSelector = {}): Promise<DeviceProbe> {
    const device = resolveDevice(this.config, selector);
    const info = await this.readDeviceInfo(device);
    const profile = selectProfile(device, info.model);
    const rest = shouldProbeRest(device, profile.restCapable) ? await this.rest.probe(device) : undefined;
    const warnings: string[] = [];

    if (profile.restCapable && rest && !rest.ok) {
      warnings.push("REST probe failed; MXA operations will fall back to TCP where possible.");
    }

    return {
      device,
      profile: summarizeProfile(profile),
      model: info.model,
      firmwareVersion: info.firmwareVersion,
      deviceId: info.deviceId,
      serialNumber: info.serialNumber,
      tcp: info.tcp,
      rest,
      capabilities: profile.capabilities,
      warnings,
    };
  }

  async getDeviceStatus(selector: DeviceSelector = {}): Promise<OperationResult<DeviceStatus>> {
    const startedAt = Date.now();
    const device = resolveDevice(this.config, selector);

    try {
      const probe = await this.probeDevice({ deviceId: device.id });
      const mute = await this.getMute({ deviceId: device.id }, { target: "device" });
      const data: DeviceStatus = {
        device,
        profile: probe.profile,
        probe,
        mute: typeof mute.data === "object" && mute.data !== null && "state" in mute.data ? String(mute.data.state) : undefined,
        info: {
          model: probe.model,
          firmwareVersion: probe.firmwareVersion,
          deviceId: probe.deviceId,
          serialNumber: probe.serialNumber,
        },
      };

      return okResult("device.status", {
        deviceId: device.id,
        durationMs: Date.now() - startedAt,
        data,
        warnings: probe.warnings,
      });
    } catch (error) {
      return errorResult("device.status", "DEVICE_STATUS_FAILED", toErrorMessage(error), {
        deviceId: device.id,
        durationMs: Date.now() - startedAt,
        remediation: ["Check the Shure Control IP address, network path, and port 2202 access."],
      });
    }
  }

  async getRoomStatus(roomId?: string): Promise<OperationResult<RoomStatus>> {
    const startedAt = Date.now();

    try {
      const room = resolveRoom(this.config, roomId);
      const statuses = await Promise.all(room.deviceIds.map((deviceId) => this.getDeviceStatus({ deviceId })));
      const devices = statuses.flatMap((status) => (status.ok && status.data ? [status.data] : []));
      const warnings = statuses.flatMap((status) => [
        ...status.warnings,
        ...(status.ok ? [] : [`${status.deviceId}: ${status.error?.message ?? "status failed"}`]),
      ]);

      return okResult("room.status", {
        durationMs: Date.now() - startedAt,
        data: { room, devices, warnings },
        warnings,
      });
    } catch (error) {
      return errorResult("room.status", "ROOM_STATUS_FAILED", toErrorMessage(error), {
        durationMs: Date.now() - startedAt,
        remediation: ["Add rooms to SHURE_CONFIG_PATH or assign room names to devices."],
      });
    }
  }

  async getMute(
    selector: DeviceSelector,
    input: { target: MuteTarget; index?: number },
  ): Promise<OperationResult<{ state?: string; target: MuteTarget; index?: number }>> {
    const startedAt = Date.now();
    const device = resolveDevice(this.config, selector);
    const profile = selectProfile(device);

    if (input.target === "device" && shouldPreferRest(device, profile.restCapable)) {
      try {
        const response = await this.rest.getMute(device);
        return okResult("mute.read", {
          deviceId: device.id,
          transport: "rest",
          durationMs: response.durationMs,
          data: { state: response.data.state, target: input.target, index: input.index },
          raw: JSON.stringify(response.data.raw),
        });
      } catch {
        // Fall through to TCP.
      }
    }

    const command = buildGetMuteCommand(input.target as LegacyMuteTarget, input.index);
    return this.sendTypedTcp(device, "mute.read", command, startedAt, {
      target: input.target,
      index: input.index,
      stateParameterFallback: inferMuteParameter(input.target),
    }) as Promise<OperationResult<{ state?: string; target: MuteTarget; index?: number }>>;
  }

  async setMute(
    selector: DeviceSelector,
    input: { target: MuteTarget; state: MuteState; index?: number },
  ): Promise<OperationResult> {
    assertTypedWriteAllowed(this.config.safety, "mute.write");
    const startedAt = Date.now();
    const device = resolveDevice(this.config, selector);
    const profile = selectProfile(device);
    const warnings: string[] = [];

    if (input.target === "device" && shouldPreferRest(device, profile.restCapable)) {
      try {
        const response = await this.rest.setMute(device, input.state);
        return okResult("mute.write", {
          deviceId: device.id,
          transport: "rest",
          durationMs: response.durationMs,
          data: { state: response.data.state, target: input.target, index: input.index },
          raw: JSON.stringify(response.data.raw),
        });
      } catch (error) {
        warnings.push(`REST mute failed, falling back to TCP: ${toErrorMessage(error)}`);
      }
    }

    const command = buildSetMuteCommand(input.target as LegacyMuteTarget, input.state, input.index);
    const result = await this.sendTypedTcp(device, "mute.write", command, startedAt, {
      target: input.target,
      index: input.index,
      requestedState: input.state,
      stateParameterFallback: inferMuteParameter(input.target),
    });
    result.warnings.unshift(...warnings);
    return result;
  }

  async setGain(
    selector: DeviceSelector,
    input: { target: GainTarget; index: number; gainDb: number },
  ): Promise<OperationResult> {
    assertTypedWriteAllowed(this.config.safety, "gain.write");
    const startedAt = Date.now();
    const device = resolveDevice(this.config, selector);
    const command = buildSetGainCommand(input.target as LegacyGainTarget, input.index, input.gainDb);

    return this.sendTypedTcp(device, "gain.write", command, startedAt, {
      target: input.target,
      index: input.index,
      requestedGainDb: input.gainDb,
    });
  }

  async getGain(
    selector: DeviceSelector,
    input: { target: GainTarget; index: number },
  ): Promise<OperationResult> {
    const startedAt = Date.now();
    const device = resolveDevice(this.config, selector);
    const command = buildGetGainCommand(input.target as LegacyGainTarget, input.index);
    const result = await this.tcp.send(device, command);
    const rawValue = firstNonErrorValue(result.parsed);

    return okResult("gain.read", {
      deviceId: device.id,
      transport: "tcp",
      durationMs: Date.now() - startedAt,
      raw: result.raw,
      frames: result.parsed.frames,
      data: {
        target: input.target,
        index: input.index,
        rawGain: rawValue,
        gainDb: rawValue ? rawGainToDb(rawValue) : undefined,
      },
    });
  }

  async identifyDevice(selector: DeviceSelector, state: "ON" | "OFF"): Promise<OperationResult> {
    assertTypedWriteAllowed(this.config.safety, "identify.write");
    const startedAt = Date.now();
    const device = resolveDevice(this.config, selector);
    return this.sendTypedTcp(device, "identify.write", buildIdentifyCommand(state), startedAt, { state });
  }

  async loadPreset(selector: DeviceSelector, preset: number): Promise<OperationResult> {
    assertTypedWriteAllowed(this.config.safety, "preset.load");
    const startedAt = Date.now();
    const device = resolveDevice(this.config, selector);
    const profile = selectProfile(device);
    const warnings: string[] = [];

    if (shouldPreferRest(device, profile.restCapable)) {
      try {
        const response = await this.rest.loadPreset(device, preset);
        return okResult("preset.load", {
          deviceId: device.id,
          transport: "rest",
          durationMs: response.durationMs,
          data: response.data,
          raw: JSON.stringify(response.data.raw),
        });
      } catch (error) {
        warnings.push(`REST preset load failed, falling back to TCP: ${toErrorMessage(error)}`);
      }
    }

    const result = await this.sendTypedTcp(device, "preset.load", buildLoadPresetCommand(preset), startedAt, { preset });
    result.warnings.unshift(...warnings);
    return result;
  }

  async getTalkerPositions(selector: DeviceSelector): Promise<OperationResult<{ positions: TalkerPosition[] }>> {
    const startedAt = Date.now();
    const device = resolveDevice(this.config, selector);
    const profile = selectProfile(device);

    if (!profile.restCapable) {
      return errorResult("talkerPositions.read", "UNSUPPORTED_PROFILE", "Talker positions require an MXA REST-capable profile.", {
        deviceId: device.id,
        durationMs: Date.now() - startedAt,
        remediation: ["Use MXA920/MXA902 firmware 6.2+ with REST API enabled, or add TCP SAMPLE subscription support later."],
      }) as OperationResult<{ positions: TalkerPosition[] }>;
    }

    try {
      const response = await this.rest.getTalkerPositions(device);
      return okResult("talkerPositions.read", {
        deviceId: device.id,
        transport: "rest",
        durationMs: response.durationMs,
        data: { positions: response.data.positions },
        raw: JSON.stringify(response.data.raw),
        warnings: response.data.positions.length === 0 ? ["REST response did not include active talker positions."] : [],
      });
    } catch (error) {
      return errorResult("talkerPositions.read", "REST_TALKER_POSITIONS_FAILED", toErrorMessage(error), {
        deviceId: device.id,
        transport: "rest",
        durationMs: Date.now() - startedAt,
        remediation: ["Confirm MXA REST API is enabled and configure restBaseUrl if the default endpoint differs."],
      }) as OperationResult<{ positions: TalkerPosition[] }>;
    }
  }

  async sendTcpCommand(
    selector: DeviceSelector,
    command: string,
    options: { waitForResponse?: boolean } = {},
  ): Promise<OperationResult> {
    const startedAt = Date.now();
    const device = resolveDevice(this.config, selector);
    const decision = evaluateRawTcpCommand(command, this.config.safety);

    if (!decision.allowed) {
      return errorResult("rawTcp.command", "SAFETY_BLOCKED", decision.reason ?? "Command blocked by safety policy.", {
        deviceId: device.id,
        durationMs: Date.now() - startedAt,
        remediation: ["Use typed tools for guarded writes or explicitly enable raw SET/destructive policy in config."],
      });
    }

    try {
      const result = await this.tcp.send(device, decision.command, { waitForResponse: options.waitForResponse });

      return okResult("rawTcp.command", {
        deviceId: device.id,
        transport: "tcp",
        durationMs: Date.now() - startedAt,
        data: { command: decision.command, mutating: decision.mutating, parameter: decision.parameter },
        raw: result.raw,
        frames: result.parsed.frames,
        warnings: result.parsed.frames.some((frame) => frame.isError) ? ["Device returned < REP ERR >."] : [],
      });
    } catch (error) {
      return errorResult("rawTcp.command", "TCP_COMMAND_FAILED", toErrorMessage(error), {
        deviceId: device.id,
        transport: "tcp",
        durationMs: Date.now() - startedAt,
      });
    }
  }

  private async readDeviceInfo(device: DeviceConfig): Promise<{
    tcp: TransportHealth;
    model?: string;
    firmwareVersion?: string;
    deviceId?: string;
    serialNumber?: string;
  }> {
    const tcp = await this.tcp.probe(device);

    if (!tcp.ok) {
      return { tcp };
    }

    const infoEntries = await Promise.all(
      Object.entries({
        model: deviceInfoCommands.model,
        firmwareVersion: deviceInfoCommands.firmwareVersion,
        deviceId: deviceInfoCommands.deviceId,
        serialNumber: deviceInfoCommands.serialNumber,
      }).map(async ([key, command]) => {
        try {
          const result = await this.tcp.send(device, command);
          const parameter = result.parsed.frames.find((frame) => !frame.isError)?.parameter;
          return [key, parameter ? firstValueForParameter(result.parsed, parameter)?.trim() : undefined] as const;
        } catch {
          return [key, undefined] as const;
        }
      }),
    );

    return {
      tcp,
      ...Object.fromEntries(infoEntries),
    };
  }

  private async sendTypedTcp(
    device: DeviceConfig,
    operation: string,
    command: string,
    startedAt: number,
    data: Record<string, unknown>,
  ): Promise<OperationResult> {
    try {
      const result = await this.tcp.send(device, command);
      const hasErrorFrame = result.parsed.frames.some((frame) => frame.isError);
      const firstValue = firstNonErrorValue(result.parsed);

      return okResult(operation, {
        deviceId: device.id,
        transport: "tcp",
        durationMs: Date.now() - startedAt,
        data: {
          ...data,
          state: typeof data.state === "string" ? data.state : firstValue,
          responseValue: firstValue,
        },
        raw: result.raw,
        frames: result.parsed.frames,
        warnings: hasErrorFrame ? ["Device returned < REP ERR >."] : [],
      });
    } catch (error) {
      return errorResult(operation, "TCP_COMMAND_FAILED", toErrorMessage(error), {
        deviceId: device.id,
        transport: "tcp",
        durationMs: Date.now() - startedAt,
        remediation: ["Check host reachability, port 2202, and whether this command is supported by the device firmware/profile."],
      });
    }
  }
}

function shouldProbeRest(device: DeviceConfig, restCapable: boolean): boolean {
  return device.preferredApi === "rest" || device.restBaseUrl !== undefined || (device.preferredApi === "auto" && restCapable);
}

function shouldPreferRest(device: DeviceConfig, restCapable: boolean): boolean {
  return restCapable && device.preferredApi !== "tcp";
}

function firstNonErrorValue(response: { frames: Array<{ isError: boolean; valueTokens: string[] }> }): string | undefined {
  return response.frames.find((frame) => !frame.isError)?.valueTokens.join(" ").trim();
}

function inferMuteParameter(target: MuteTarget): string {
  switch (target) {
    case "device":
      return "DEVICE_AUDIO_MUTE";
    case "channel":
      return "AUDIO_MUTE";
    case "automixer":
      return "AUTOMXR_MUTE";
    case "coverageArea":
      return "CA_MUTE";
    case "postGateChannel":
      return "AUDIO_MUTE_POSTGATE";
  }
}
