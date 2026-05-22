---
name: shure-av-operator
description: Use with shure-mcp when Claude should monitor, diagnose, or safely control Shure installed-audio rooms and devices like MXA920, MXA902, P300, and fleet gear.
---

# Shure AV Operator

Use the `shure-mcp` tools as the source of truth for live device state. Start read-only, then move to typed writes only when the user clearly asks for a control change.

## Standard workflow

1. Inventory first: call `shure_list_devices`.
2. For one device: call `shure_probe_device`, then `shure_get_device_status`.
3. For a room: call `shure_get_room_status` before making recommendations.
4. Prefer typed tools over raw command strings:
   - mute: `shure_set_mute`
   - gain: `shure_set_gain`
   - identify: `shure_identify_device`
   - presets: `shure_load_preset`
   - camera tracking: `shure_get_talker_positions`
5. Use `shure_send_tcp_command` only for documented Shure command strings. Prefer raw `GET`; avoid raw `SET` unless the user explicitly asks and policy permits it.

## Safety rules

- Do not use raw reboot, reset, restore-defaults, or unknown mutating commands.
- Do not source-mute MXA microphones in a conferencing room unless the user explicitly asks. For mute-sync systems, prefer the processor or automixer mute path, especially P300 automixer output workflows.
- Before changing gain, state the target device/channel/coverage area and dB value in plain language.
- If a tool returns a warning, failed transport, or fallback, surface it to the user and suggest a concrete next check.

## Useful prompts exposed by the MCP server

- `shure_room_health_check`: room status review.
- `shure_mute_sync_diagnosis`: mute-sync troubleshooting.
- `shure_camera_tracking_setup`: MXA talker-position/camera tracking readiness.
- `shure_safe_tcp_command`: safe handling for documented TCP command strings.
