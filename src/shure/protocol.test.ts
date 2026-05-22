import assert from "node:assert/strict";
import test from "node:test";
import { firstValueForParameter, normalizeCommand, parseShureResponse } from "./protocol.js";

test("normalizeCommand validates and normalizes Shure command strings", () => {
  assert.equal(normalizeCommand(" < get model > "), "< get model >");
  assert.equal(normalizeCommand(" < SET DEVICE_ID Boardroom One > "), "< SET DEVICE_ID Boardroom One >");
  assert.throws(() => normalizeCommand("GET MODEL"), /must look like/);
  assert.throws(() => normalizeCommand("< REP MODEL MXA920 >"), /must look like/);
});

test("parseShureResponse extracts multiple angle-bracket frames", () => {
  const parsed = parseShureResponse("< REP MODEL MXA920          >< REP FW_VER 6.6.1 >");

  assert.equal(parsed.frames.length, 2);
  assert.equal(parsed.frames[0].type, "REP");
  assert.equal(parsed.frames[0].parameter, "MODEL");
  assert.equal(parsed.frames[0].valueTokens.join(" "), "MXA920");
  assert.equal(firstValueForParameter(parsed, "FW_VER"), "6.6.1");
});

test("parseShureResponse recognizes indexed reports and errors", () => {
  const parsed = parseShureResponse("noise< REP 01 AUDIO_MUTE ON >< REP ERR >tail");

  assert.equal(parsed.frames[0].index, "01");
  assert.equal(parsed.frames[0].parameter, "AUDIO_MUTE");
  assert.deepEqual(parsed.frames[0].valueTokens, ["ON"]);
  assert.equal(parsed.frames[1].isError, true);
  assert.equal(parsed.trailingText, "noisetail");
});
