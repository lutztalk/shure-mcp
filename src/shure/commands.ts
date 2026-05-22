export const DEFAULT_SHURE_PORT = 2202;

export type MuteTarget = "device" | "channel" | "automixer" | "coverageArea" | "postGateChannel";
export type MuteState = "ON" | "OFF" | "TOGGLE";
export type GainTarget = "channel" | "coverageArea";

export const deviceInfoCommands = {
  model: "< GET MODEL >",
  serialNumber: "< GET SERIAL_NUM >",
  firmwareVersion: "< GET FW_VER >",
  deviceId: "< GET DEVICE_ID >",
  networkAudioDeviceName: "< GET NA_DEVICE_NAME >",
  primaryAudioIpAddress: "< GET IP_ADDR_NET_AUDIO_PRIMARY >",
  primaryAudioSubnetMask: "< GET IP_SUBNET_NET_AUDIO_PRIMARY >",
  primaryAudioGateway: "< GET IP_GATEWAY_NET_AUDIO_PRIMARY >",
  controlMacAddress: "< GET CONTROL_MAC_ADDR >",
  encryption: "< GET ENCRYPTION >",
} as const;

export function buildGetMuteCommand(target: MuteTarget, index?: number): string {
  switch (target) {
    case "device":
      return "< GET DEVICE_AUDIO_MUTE >";
    case "channel":
      return `< GET ${formatIndex(requireIndex(target, index))} AUDIO_MUTE >`;
    case "automixer":
      return `< GET ${formatIndex(index ?? 21)} AUTOMXR_MUTE >`;
    case "coverageArea":
      return `< GET ${formatIndex(requireIndex(target, index))} CA_MUTE >`;
    case "postGateChannel":
      return `< GET ${formatIndex(requireIndex(target, index))} AUDIO_MUTE_POSTGATE >`;
  }
}

export function buildSetMuteCommand(target: MuteTarget, state: MuteState, index?: number): string {
  switch (target) {
    case "device":
      return `< SET DEVICE_AUDIO_MUTE ${state} >`;
    case "channel":
      return `< SET ${formatIndex(requireIndex(target, index))} AUDIO_MUTE ${state} >`;
    case "automixer":
      return `< SET ${formatIndex(index ?? 21)} AUTOMXR_MUTE ${state} >`;
    case "coverageArea":
      return `< SET ${formatIndex(requireIndex(target, index))} CA_MUTE ${state} >`;
    case "postGateChannel":
      return `< SET ${formatIndex(requireIndex(target, index))} AUDIO_MUTE_POSTGATE ${state} >`;
  }
}

export function buildGetGainCommand(target: GainTarget, index: number): string {
  switch (target) {
    case "channel":
      return `< GET ${formatIndex(index)} AUDIO_GAIN_HI_RES >`;
    case "coverageArea":
      return `< GET ${formatIndex(index)} CA_GAIN >`;
  }
}

export function buildSetGainCommand(target: GainTarget, index: number, gainDb: number): string {
  const rawGain = dbToRawGain(gainDb);

  switch (target) {
    case "channel":
      return `< SET ${formatIndex(index)} AUDIO_GAIN_HI_RES ${rawGain} >`;
    case "coverageArea":
      return `< SET ${formatIndex(index)} CA_GAIN ${rawGain} >`;
  }
}

export function buildIdentifyCommand(state: "ON" | "OFF"): string {
  return `< SET FLASH ${state} >`;
}

export function buildLoadPresetCommand(preset: number): string {
  if (!Number.isInteger(preset) || preset < 1 || preset > 10) {
    throw new Error("Preset must be an integer from 1 through 10.");
  }

  return `< SET PRESET ${String(preset).padStart(2, "0")} >`;
}

export function dbToRawGain(gainDb: number): string {
  if (!Number.isFinite(gainDb) || gainDb < -110 || gainDb > 30) {
    throw new Error("Gain must be between -110 dB and 30 dB.");
  }

  return String(Math.round((gainDb + 110) * 10)).padStart(4, "0");
}

export function rawGainToDb(rawGain: string): number | undefined {
  if (!/^\d{1,4}$/.test(rawGain)) {
    return undefined;
  }

  return Number(rawGain) / 10 - 110;
}

export function formatIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 99) {
    throw new Error("Channel or coverage index must be an integer from 0 through 99.");
  }

  return String(index).padStart(2, "0");
}

function requireIndex(target: string, index: number | undefined): number {
  if (index === undefined) {
    throw new Error(`${target} commands require an index.`);
  }

  return index;
}
