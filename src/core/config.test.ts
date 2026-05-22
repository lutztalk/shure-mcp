import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "./config.js";

test("loadConfig supports SHURE_CONFIG_PATH with devices, rooms, safety, and timeouts", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shure-mcp-"));
  const configPath = path.join(tempDir, "shure.json");

  fs.writeFileSync(
    configPath,
    JSON.stringify({
      devices: [
        {
          id: "boardroom-mxa",
          name: "Boardroom MXA920",
          host: "192.0.2.10",
          model: "MXA920",
          room: "Boardroom",
          tags: ["ceiling"],
          preferredApi: "rest",
          tcpPort: 2202,
          restBaseUrl: "https://192.0.2.10",
          tls: "insecure",
        },
      ],
      rooms: [{ id: "boardroom", name: "Boardroom", deviceIds: ["boardroom-mxa"] }],
      safety: { allowRawSet: true },
      timeouts: { tcpMs: 3000, restMs: 4000, idleMs: 200 },
      logging: { level: "debug" },
    }),
  );

  const config = loadConfig({ SHURE_CONFIG_PATH: configPath });

  assert.equal(config.devices[0].id, "boardroom-mxa");
  assert.equal(config.rooms[0].deviceIds[0], "boardroom-mxa");
  assert.equal(config.safety.allowRawSet, true);
  assert.equal(config.safety.allowDestructive, false);
  assert.equal(config.timeouts.tcpMs, 3000);
  assert.equal(config.logging.level, "debug");
});

test("legacy environment config still creates devices", () => {
  const config = loadConfig({
    SHURE_DEVICES: JSON.stringify([{ name: "Legacy P300", host: "192.0.2.20", model: "P300", room: "Room A" }]),
    SHURE_ALLOWED_HOSTS: "192.0.2.20",
  });

  assert.equal(config.devices[0].id, "legacy-p300");
  assert.equal(config.devices[0].tcpPort, 2202);
  assert.equal(config.rooms[0].id, "room-a");
  assert.deepEqual(config.allowedHosts, ["192.0.2.20"]);
});
