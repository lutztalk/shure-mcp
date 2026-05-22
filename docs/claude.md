# Claude Integration

`shure-mcp` is intended to run as a local stdio MCP server for Claude. This keeps Shure device traffic on the same machine/network that can reach the Shure Control IPs.

Claude supports several paths:

- **Claude Desktop manual MCP config:** easiest while developing.
- **Claude Code MCP config:** useful while working in this repo.
- **Claude Desktop MCPB package:** best long-term user experience for one-click internal installs.
- **Claude Skill:** optional playbook that teaches Claude how to use the MCP tools safely.

## 1. Build the server

```bash
cd /Users/stella/shure-mcp
npm install
npm run build
```

Create a real config by copying `examples/shure.config.example.json` and replacing the IPs with Shure Control IPs.

## 2. Claude Desktop manual config

Claude Desktop local stdio servers use `claude_desktop_config.json`.

macOS:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Windows:

```text
%APPDATA%\Claude\claude_desktop_config.json
```

Example:

```json
{
  "mcpServers": {
    "shure": {
      "command": "node",
      "args": ["/Users/stella/shure-mcp/dist/index.js"],
      "env": {
        "SHURE_CONFIG_PATH": "/Users/stella/shure-mcp/examples/shure.config.example.json"
      }
    }
  }
}
```

Restart Claude Desktop after editing. In Claude Desktop, check connected tools/connectors and look for the `shure_*` tools.

## 3. Claude Code config

From this repo:

```bash
claude mcp add --transport stdio --scope local --env SHURE_CONFIG_PATH=/Users/stella/shure-mcp/examples/shure.config.example.json shure -- node /Users/stella/shure-mcp/dist/index.js
```

Then verify:

```bash
claude mcp list
claude mcp get shure
```

Inside Claude Code, run `/mcp` and confirm the Shure server is connected.

For project-shared config, copy `examples/claude-code.mcp.json` to `.mcp.json` and edit the absolute paths for your checkout and real Shure config file.

## 4. MCPB packaging for Claude Desktop

Claude Desktop supports MCPB bundles for one-click local MCP installation. This repo includes a root `manifest.json`.

Build and package:

```bash
npm install
npm run mcpb:pack
```

Install the generated `.mcpb` in Claude Desktop:

1. Settings -> Extensions.
2. Advanced settings.
3. Install Extension.
4. Select `/Users/stella/shure-mcp/shure-mcp.mcpb`.
5. Enter the absolute path to your Shure config JSON.

## 5. Optional Claude skill

The folder `skills/shure-av-operator` contains a skill-style playbook for safe Shure room operations.

Validate and package it:

```bash
npm run skill:pack
```

Upload `/Users/stella/shure-mcp/skills/shure-av-operator.zip` wherever your Claude environment supports custom skills. The skill does not replace the MCP server; it teaches Claude when and how to use the MCP tools.

## Smoke test

Before opening Claude, verify the server itself:

```bash
npm test
node dist/index.js
```

`node dist/index.js` waits for MCP stdio traffic, so stop it with `Ctrl-C` after confirming it starts without crashing.

For protocol inspection:

```bash
npm run inspect
```

## Operational prompts to try in Claude

```text
Use the Shure MCP server to list configured devices and run a room health check.
```

```text
Probe the boardroom MXA920 and tell me whether REST or TCP is available.
```

```text
Mute the P300 automixer output in the boardroom.
```

```text
Check whether the MXA920 is returning talker positions for camera tracking.
```
