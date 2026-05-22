import type { Capability, DeviceConfig, DeviceProfileSummary, KnownModel } from "../core/types.js";

export type DeviceProfile = DeviceProfileSummary & {
  aliases: string[];
  restCapable: boolean;
  notes: string[];
};

const commonTcpCapabilities: Capability[] = [
  "device.info",
  "device.status",
  "mute.read",
  "mute.write",
  "gain.read",
  "gain.write",
  "identify.write",
  "preset.load",
  "rawTcp.read",
  "rawTcp.write",
  "audio.metering",
  "dante.read",
];

const profiles: DeviceProfile[] = [
  {
    id: "mxa920",
    model: "MXA920",
    displayName: "Shure MXA920 Ceiling Array Microphone",
    aliases: ["MXA920", "MXA920-S", "MXA920-R"],
    capabilities: [...commonTcpCapabilities, "talkerPositions.read"],
    prefersRest: true,
    restCapable: true,
    notes: [
      "REST API is available on firmware 6.2.x and newer when enabled on the device.",
      "TCP command strings remain useful for broad room-control compatibility.",
    ],
  },
  {
    id: "mxa902",
    model: "MXA902",
    displayName: "Shure MXA902 Integrated Conferencing Ceiling Array",
    aliases: ["MXA902"],
    capabilities: [...commonTcpCapabilities, "talkerPositions.read"],
    prefersRest: true,
    restCapable: true,
    notes: [
      "REST API is available on firmware 6.2.x and newer when enabled on the device.",
      "MXA902 includes loudspeaker-specific controls in Shure's REST surface; use raw TCP only for documented commands.",
    ],
  },
  {
    id: "p300",
    model: "P300",
    displayName: "Shure P300 IntelliMix Audio Conferencing Processor",
    aliases: ["P300"],
    capabilities: commonTcpCapabilities,
    prefersRest: false,
    restCapable: false,
    notes: [
      "P300 mute-sync workflows usually target the automixer output rather than muting microphones at source.",
    ],
  },
  {
    id: "mxa910",
    model: "MXA910",
    displayName: "Shure MXA910 Ceiling Array Microphone",
    aliases: ["MXA910", "MXA910-S"],
    capabilities: commonTcpCapabilities,
    prefersRest: false,
    restCapable: false,
    notes: [
      "Classic ceiling array; TCP command-string control.",
      "Frequently paired with P300 IntelliMix in conferencing rooms.",
    ],
  },
  {
    id: "mxa310",
    model: "MXA310",
    displayName: "Shure MXA310 Table Array Microphone",
    aliases: ["MXA310"],
    capabilities: commonTcpCapabilities,
    prefersRest: false,
    restCapable: false,
    notes: [
      "Table-mounted array; TCP command-string control.",
      "Supports 4-channel automix output and individual channel control.",
    ],
  },
  {
    id: "mxa710",
    model: "MXA710",
    displayName: "Shure MXA710 Linear Array Microphone",
    aliases: ["MXA710", "MXA710W"],
    capabilities: [...commonTcpCapabilities, "talkerPositions.read"],
    prefersRest: true,
    restCapable: true,
    notes: [
      "2-foot linear array with Steerable Coverage and REST API on current firmware.",
      "Talker positions available via REST; ideal for side-wall conferencing installs.",
    ],
  },
  {
    id: "qlxd4d",
    model: "QLXD4D",
    displayName: "Shure QLXD4D Dual-Channel Wireless Receiver",
    aliases: ["QLXD4D", "QLXD4", "QLXD"],
    capabilities: [...commonTcpCapabilities, "wireless.read"],
    prefersRest: false,
    restCapable: false,
    notes: [
      "Dual-channel QLX-D wireless receiver; reports battery charge, RF frequency, and signal strength via TCP.",
      "Battery monitoring critical for boardroom and live-event deployments.",
    ],
  },
  {
    id: "ulxd4d",
    model: "ULXD4D",
    displayName: "Shure ULXD4D Dual-Channel Wireless Receiver",
    aliases: ["ULXD4D", "ULXD4"],
    capabilities: [...commonTcpCapabilities, "wireless.read"],
    prefersRest: false,
    restCapable: false,
    notes: [
      "Dual-channel ULX-D wireless receiver; reports battery, RF frequency, and transmitter type via TCP.",
      "Supports SB900A and SB900B rechargeable battery packs.",
    ],
  },
  {
    id: "ulxd4q",
    model: "ULXD4Q",
    displayName: "Shure ULXD4Q Quad-Channel Wireless Receiver",
    aliases: ["ULXD4Q"],
    capabilities: [...commonTcpCapabilities, "wireless.read"],
    prefersRest: false,
    restCapable: false,
    notes: [
      "Quad-channel ULX-D wireless receiver for high-density installations.",
      "Supports four independent wireless channels with full TCP monitoring.",
    ],
  },
  {
    id: "ad600",
    model: "AD600",
    displayName: "Shure Axient Digital AD600 ShowLink Access Point",
    aliases: ["AD600", "ADX", "ADUHD"],
    capabilities: [...commonTcpCapabilities, "wireless.read"],
    prefersRest: false,
    restCapable: false,
    notes: [
      "Axient Digital enterprise wireless with real-time RF spectrum management.",
      "Reports battery, frequency, and RF interference metrics via TCP.",
    ],
  },
  {
    id: "intellimix-room",
    model: "IntelliMixRoom",
    displayName: "Shure IntelliMix Room Audio Processor",
    aliases: ["IntelliMixRoom", "INTELLIMIX", "IMR"],
    capabilities: commonTcpCapabilities,
    prefersRest: false,
    restCapable: false,
    notes: [
      "Software DSP processor for Microsoft Teams Rooms, Zoom Rooms, and other platforms.",
      "USB audio interface; frequently paired with MXA ceiling arrays.",
    ],
  },
  {
    id: "generic-tcp",
    model: "genericTcp",
    displayName: "Generic Shure TCP Command-String Device",
    aliases: [],
    capabilities: commonTcpCapabilities,
    prefersRest: false,
    restCapable: false,
    notes: [
      "Generic profile exposes conservative TCP command-string operations shared by many Shure installed-audio devices.",
    ],
  },
];

export function listProfiles(): DeviceProfile[] {
  return profiles;
}

export function getProfileById(id: string): DeviceProfile | undefined {
  return profiles.find((profile) => profile.id === id || profile.model === id);
}

export function selectProfile(device: DeviceConfig, probedModel?: string): DeviceProfile {
  const model = (probedModel ?? device.model ?? "").toUpperCase();
  const exact = profiles.find((profile) => profile.aliases.some((alias) => model.includes(alias)));
  return exact ?? profiles[profiles.length - 1];
}

export function summarizeProfile(profile: DeviceProfile): DeviceProfileSummary {
  return {
    id: profile.id,
    model: profile.model as KnownModel,
    displayName: profile.displayName,
    capabilities: profile.capabilities,
    prefersRest: profile.prefersRest,
  };
}
