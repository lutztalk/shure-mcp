import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "./core/config.js";
import { createServer } from "./mcp.js";

test("MCP server exposes canonical tools, resources, prompts, and compatibility aliases", async () => {
  const config = loadConfig({
    SHURE_DEVICES: JSON.stringify([{ id: "mxa", name: "MXA", host: "192.0.2.10", model: "MXA920" }]),
    SHURE_ALLOWED_HOSTS: "192.0.2.10",
  });
  const server = createServer(config);
  const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const tools = await client.listTools();
    const prompts = await client.listPrompts();
    const resources = await client.listResources();
    const listResult = await client.callTool({ name: "shure_list_devices", arguments: {} });

    const toolNames = tools.tools.map((tool) => tool.name);
    assert.ok(toolNames.includes("shure_probe_device"));
    assert.ok(toolNames.includes("shure_send_tcp_command"));
    assert.ok(toolNames.includes("shure_send_command"));
    assert.ok(prompts.prompts.some((prompt) => prompt.name === "shure_room_health_check"));
    assert.ok(resources.resources.some((resource) => resource.uri === "shure://devices"));
    const content = listResult.content as Array<{ type: string }>;
    assert.equal(content[0].type, "text");
  } finally {
    await client.close();
    await server.close();
  }
});
