import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../core/config.js";
import { MxaRestSimulator } from "../simulator/rest.js";
import { MxaRestTransport } from "./rest.js";

test("MxaRestTransport normalizes mute and talker-position responses", async () => {
  const simulator = await new MxaRestSimulator().start();

  try {
    const config = loadConfig({
      SHURE_DEVICES: JSON.stringify([
        {
          id: "mxa",
          name: "MXA",
          host: "127.0.0.1",
          model: "MXA920",
          restBaseUrl: simulator.baseUrl,
        },
      ]),
      SHURE_ALLOWED_HOSTS: "127.0.0.1",
    });
    const transport = new MxaRestTransport(config);
    const device = config.devices[0];

    const mute = await transport.setMute(device, "ON");
    const positions = await transport.getTalkerPositions(device);

    assert.equal(mute.data.state, "ON");
    assert.equal(positions.data.positions[0].xCm, 137);
    assert.equal(positions.data.positions[0].coverageAreaId, 2);
  } finally {
    await simulator.stop();
  }
});
