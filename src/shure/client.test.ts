import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { sendShureCommand } from "./client.js";

test("sendShureCommand exchanges raw angle-bracket frames without newline delimiters", async () => {
  const server = net.createServer((socket) => {
    socket.once("data", (chunk) => {
      assert.equal(chunk.toString("ascii"), "< GET MODEL >");
      socket.write("< REP MODEL MXA920 >");
    });
  });

  await listen(server);

  try {
    const address = server.address();
    assertAddress(address);

    const result = await sendShureCommand({
      host: "127.0.0.1",
      port: address.port,
      command: "< GET MODEL >",
      timeoutMs: 1000,
      idleMs: 25,
    });

    assert.equal(result.raw, "< REP MODEL MXA920 >");
    assert.equal(result.parsed.frames[0].parameter, "MODEL");
    assert.equal(result.parsed.frames[0].valueTokens.join(" "), "MXA920");
  } finally {
    await close(server);
  }
});

test("sendShureCommand supports documented no-acknowledgement commands", async () => {
  let received = "";
  const server = net.createServer((socket) => {
    socket.once("data", (chunk) => {
      received = chunk.toString("ascii");
    });
  });

  await listen(server);

  try {
    const address = server.address();
    assertAddress(address);

    const result = await sendShureCommand({
      host: "127.0.0.1",
      port: address.port,
      command: "< SET REBOOT >",
      timeoutMs: 1000,
      idleMs: 25,
      waitForResponse: false,
    });

    assert.equal(received, "< SET REBOOT >");
    assert.equal(result.raw, "");
    assert.deepEqual(result.parsed.frames, []);
  } finally {
    await close(server);
  }
});

function listen(server: net.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: net.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function assertAddress(address: string | net.AddressInfo | null): asserts address is net.AddressInfo {
  assert.ok(address && typeof address !== "string");
}
