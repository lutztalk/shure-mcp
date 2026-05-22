import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../core/config.js";
import { MxaRestSimulator } from "../simulator/rest.js";
import { ShureTcpSimulator } from "../simulator/tcp.js";
import { DeviceService } from "./device-service.js";

test("DeviceService probes MXA REST+TCP and uses guarded write policy", async () => {
  const tcp = await new ShureTcpSimulator({ model: "MXA920" }).start();
  const rest = await new MxaRestSimulator().start();

  try {
    const config = loadConfig({
      SHURE_DEVICES: JSON.stringify([
        {
          id: "boardroom-mxa",
          name: "Boardroom MXA",
          host: "127.0.0.1",
          model: "MXA920",
          tcpPort: tcp.port,
          restBaseUrl: rest.baseUrl,
          preferredApi: "auto",
          room: "Boardroom",
        },
      ]),
      SHURE_ALLOWED_HOSTS: "127.0.0.1",
    });
    const service = new DeviceService(config);

    const probe = await service.probeDevice({ deviceId: "boardroom-mxa" });
    const mute = await service.setMute({ deviceId: "boardroom-mxa" }, { target: "device", state: "ON" });
    const gain = await service.setGain({ deviceId: "boardroom-mxa" }, { target: "channel", index: 9, gainDb: 0 });
    const talkers = await service.getTalkerPositions({ deviceId: "boardroom-mxa" });
    const blocked = await service.sendTcpCommand({ deviceId: "boardroom-mxa" }, "< SET DEVICE_AUDIO_MUTE ON >");

    assert.equal(probe.rest?.ok, true);
    assert.equal(mute.transport, "rest");
    assert.equal(mute.ok, true);
    assert.equal(gain.transport, "tcp");
    assert.equal(gain.ok, true);
    assert.equal(talkers.data?.positions.length, 1);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error?.code, "SAFETY_BLOCKED");
  } finally {
    await tcp.stop();
    await rest.stop();
  }
});
