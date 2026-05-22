import assert from "node:assert/strict";
import test from "node:test";
import { selectProfile } from "./device-profile.js";
import type { DeviceConfig } from "../core/types.js";

const baseDevice: DeviceConfig = {
  id: "device",
  name: "Device",
  host: "192.0.2.10",
  tags: [],
  preferredApi: "auto",
  tcpPort: 2202,
  tls: "verify",
};

test("selectProfile chooses MXA920 from configured or probed model", () => {
  assert.equal(selectProfile({ ...baseDevice, model: "MXA920W-S" }).model, "MXA920");
  assert.equal(selectProfile(baseDevice, "MXA902").model, "MXA902");
});

test("selectProfile falls back to generic TCP", () => {
  assert.equal(selectProfile({ ...baseDevice, model: "ULXD4" }).model, "genericTcp");
});
