# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-04-28

Initial release. Port of `opencode-debug-agent` to a Claude Code plugin.

### Added
- 5 MCP tools: `debug_start`, `debug_stop`, `debug_read`, `debug_clear`, `debug_status`.
- Debug agent (`/agents debug`) with workflow prompt.
- Debug skill (`skills/debug`) usable from any agent.
- Hono HTTP capture server with CORS for browser instrumentation.
- Port persistence across sessions in `.claude/debug-agent/debug.port`.
- NDJSON log file at `.claude/debug-agent/debug.log`.
