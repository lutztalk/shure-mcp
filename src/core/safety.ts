import { normalizeCommand, tokenizeFrameBody } from "../shure/protocol.js";
import type { SafetyPolicy } from "./types.js";

export type SafetyDecision = {
  allowed: boolean;
  command: string;
  verb: "GET" | "SET";
  parameter?: string;
  destructive: boolean;
  mutating: boolean;
  reason?: string;
};

const destructiveParameters = new Set([
  "REBOOT",
  "DEFAULT_SETTINGS",
  "FACTORY_RESET",
  "RESET",
  "RESTORE",
]);

const knownSafeRawSetParameters = new Set([
  "FLASH",
  "DEVICE_AUDIO_MUTE",
  "AUDIO_MUTE",
  "AUTOMXR_MUTE",
  "CA_MUTE",
  "AUDIO_MUTE_POSTGATE",
  "AUDIO_GAIN_HI_RES",
  "CA_GAIN",
  "PRESET",
]);

export function evaluateRawTcpCommand(commandInput: string, policy: SafetyPolicy): SafetyDecision {
  const command = normalizeCommand(commandInput);
  const tokens = tokenizeFrameBody(command.slice(1, -1).trim());
  const verb = tokens[0]?.toUpperCase();

  if (verb !== "GET" && verb !== "SET") {
    return {
      allowed: false,
      command,
      verb: "GET",
      mutating: false,
      destructive: false,
      reason: "Only GET and SET command strings are supported.",
    };
  }

  const parameter = inferParameter(tokens);
  const mutating = verb === "SET";
  const destructive = parameter ? destructiveParameters.has(parameter) : false;

  if (!mutating) {
    return { allowed: true, command, verb, parameter, mutating, destructive };
  }

  if (destructive && !policy.allowDestructive) {
    return {
      allowed: false,
      command,
      verb,
      parameter,
      mutating,
      destructive,
      reason: `Raw destructive command '${parameter}' is blocked. Enable allowDestructive only in trusted maintenance contexts.`,
    };
  }

  if (!policy.allowRawSet) {
    return {
      allowed: false,
      command,
      verb,
      parameter,
      mutating,
      destructive,
      reason: "Raw SET commands are blocked by guarded write policy. Use typed tools or enable allowRawSet.",
    };
  }

  if (parameter && !knownSafeRawSetParameters.has(parameter) && !policy.allowUnknownMutatingCommands) {
    return {
      allowed: false,
      command,
      verb,
      parameter,
      mutating,
      destructive,
      reason: `Raw SET command '${parameter}' is not on the known safe list.`,
    };
  }

  return { allowed: true, command, verb, parameter, mutating, destructive };
}

export function assertTypedWriteAllowed(policy: SafetyPolicy, operation: string, destructive = false): void {
  if (destructive && !policy.allowDestructive) {
    throw new Error(`${operation} is destructive and is blocked by safety policy.`);
  }
}

function inferParameter(tokens: string[]): string | undefined {
  if (tokens.length < 2) {
    return undefined;
  }

  if (/^\d{1,2}$/.test(tokens[1]) && tokens[2]) {
    return tokens[2].toUpperCase();
  }

  return tokens[1]?.toUpperCase();
}
