import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Claude integration JSON examples are parseable and point at shure-mcp", () => {
  const desktopConfig = JSON.parse(fs.readFileSync("examples/claude-desktop-config.macos.json", "utf8")) as {
    mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
  };
  const codeConfig = JSON.parse(fs.readFileSync("examples/claude-code.mcp.json", "utf8")) as {
    mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
  };
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8")) as {
    manifest_version: string;
    name: string;
    server: { mcp_config: { command: string; args: string[]; env: Record<string, string> } };
    user_config: Record<string, unknown>;
  };
  const skill = fs.readFileSync("skills/shure-av-operator/SKILL.md", "utf8");

  assert.equal(desktopConfig.mcpServers.shure.command, "npx");
  assert.ok(desktopConfig.mcpServers.shure.args.includes("github:lutztalk/shure-mcp"));
  assert.equal(codeConfig.mcpServers.shure.command, "npx");
  assert.ok(codeConfig.mcpServers.shure.args.includes("github:lutztalk/shure-mcp"));
  assert.equal(manifest.manifest_version, "0.3");
  assert.equal(manifest.name, "shure-mcp");
  assert.equal(manifest.server.mcp_config.command, "node");
  assert.match(manifest.server.mcp_config.args[0], /dist\/index\.js/);
  assert.ok(manifest.user_config.shure_config_path);
  assert.match(skill, /^name: shure-av-operator$/m);
  const description = skill.match(/^description: (.+)$/m)?.[1] ?? "";
  assert.ok(description.length > 0 && description.length <= 200);
});
