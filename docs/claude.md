# Claude Integration

`shure-mcp` runs as a local stdio MCP server for Claude. This keeps Shure device traffic on the same machine/network that can reach the Shure Control IPs.

You do not need to clone or build anything — `npx` fetches, builds, and runs the server straight from GitHub. The only requirements are **Node.js `>=20`** and **git** on the machine running Claude.

## Quick install

### Claude Code

```bash
claude mcp add shure -- npx -y github:lutztalk/shure-mcp
```

Then verify:

```bash
claude mcp list
claude mcp get shure
```

Inside Claude Code, run `/mcp` and confirm the Shure server is connected and the `shure_*` tools are listed.

### Claude Desktop

Add this to `claude_desktop_config.json`, then restart Claude Desktop:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "shure": {
      "command": "npx",
      "args": ["-y", "github:lutztalk/shure-mcp"]
    }
  }
}
```

In Claude Desktop, check connected tools/connectors and look for the `shure_*` tools.

> The first launch is slower because `npx` clones and builds the server; subsequent launches are fast.

## Adding your devices

The server starts and exposes every tool with **no configuration** — fleet/device tools simply report no devices until you point it at a config.

To control real hardware, create a config file (copy [`examples/shure.config.example.json`](../examples/shure.config.example.json) and replace the IPs with your Shure Control IPs), then pass its absolute path via `SHURE_CONFIG_PATH`.

Claude Code:

```bash
claude mcp add shure \
  --env SHURE_CONFIG_PATH=/absolute/path/to/shure.config.json \
  -- npx -y github:lutztalk/shure-mcp
```

Claude Desktop:

```json
{
  "mcpServers": {
    "shure": {
      "command": "npx",
      "args": ["-y", "github:lutztalk/shure-mcp"],
      "env": {
        "SHURE_CONFIG_PATH": "/absolute/path/to/shure.config.json"
      }
    }
  }
}
```

For project-shared config in a repo, copy [`examples/claude-code.mcp.json`](../examples/claude-code.mcp.json) to `.mcp.json`.

## Local development install

If you are working on the server itself, run it from a checkout instead:

```bash
git clone https://github.com/lutztalk/shure-mcp.git
cd shure-mcp
npm install
npm run build
```

Point Claude at the built entry point (`command: "node"`, `args: ["<checkout>/dist/index.js"]`).

## MCPB bundle for Claude Desktop

Claude Desktop also supports one-click MCPB bundles. From a checkout:

```bash
npm install
npm run mcpb:pack
```

Install the generated `shure-mcp.mcpb` via Settings → Extensions → Advanced settings → Install Extension, then enter the absolute path to your Shure config JSON when prompted.

## Optional Claude skill

The folder `skills/shure-av-operator` contains a skill-style playbook for safe Shure room operations. Package it with `npm run skill:pack` and upload the resulting ZIP wherever your Claude environment supports custom skills. The skill does not replace the MCP server; it teaches Claude when and how to use the MCP tools.

## Smoke test

To verify the server runs without Claude:

```bash
npx -y github:lutztalk/shure-mcp
```

It waits for MCP stdio traffic, so it will look idle — stop it with `Ctrl-C` once it starts without crashing. For protocol inspection from a checkout, use `npm run inspect`.

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
