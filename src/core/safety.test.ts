import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRawTcpCommand } from "./safety.js";
import type { SafetyPolicy } from "./types.js";

const guarded: SafetyPolicy = {
  allowRawSet: false,
  allowDestructive: false,
  allowUnknownMutatingCommands: false,
};

test("safety allows raw GET commands", () => {
  const decision = evaluateRawTcpCommand("< GET MODEL >", guarded);

  assert.equal(decision.allowed, true);
  assert.equal(decision.mutating, false);
});

test("safety blocks raw SET by default", () => {
  const decision = evaluateRawTcpCommand("< SET DEVICE_AUDIO_MUTE ON >", guarded);

  assert.equal(decision.allowed, false);
  assert.match(decision.reason ?? "", /Raw SET/);
});

test("safety blocks destructive commands even when raw SET is enabled", () => {
  const decision = evaluateRawTcpCommand("< SET REBOOT >", { ...guarded, allowRawSet: true });

  assert.equal(decision.allowed, false);
  assert.equal(decision.destructive, true);
});

test("safety allows known safe raw SET only when configured", () => {
  const decision = evaluateRawTcpCommand("< SET FLASH ON >", { ...guarded, allowRawSet: true });

  assert.equal(decision.allowed, true);
});
