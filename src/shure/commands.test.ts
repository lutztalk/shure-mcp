import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGetGainCommand,
  buildGetMuteCommand,
  buildIdentifyCommand,
  buildSetGainCommand,
  buildSetMuteCommand,
  dbToRawGain,
  rawGainToDb,
} from "./commands.js";

test("builds common mute commands", () => {
  assert.equal(buildGetMuteCommand("device"), "< GET DEVICE_AUDIO_MUTE >");
  assert.equal(buildSetMuteCommand("channel", "TOGGLE", 1), "< SET 01 AUDIO_MUTE TOGGLE >");
  assert.equal(buildSetMuteCommand("automixer", "ON"), "< SET 21 AUTOMXR_MUTE ON >");
  assert.equal(buildGetMuteCommand("coverageArea", 8), "< GET 08 CA_MUTE >");
});

test("builds common gain commands and converts dB to raw Shure gain", () => {
  assert.equal(dbToRawGain(-110), "0000");
  assert.equal(dbToRawGain(0), "1100");
  assert.equal(dbToRawGain(30), "1400");
  assert.equal(rawGainToDb("1100"), 0);
  assert.equal(buildGetGainCommand("channel", 9), "< GET 09 AUDIO_GAIN_HI_RES >");
  assert.equal(buildSetGainCommand("coverageArea", 2, -3), "< SET 02 CA_GAIN 1070 >");
});

test("builds identify command", () => {
  assert.equal(buildIdentifyCommand("ON"), "< SET FLASH ON >");
});
