# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0](https://github.com/anis-dr/claude-debug-agent/compare/v0.1.0...v0.2.0) (2026-04-28)


### Features

* add debug agent ([8ec57e9](https://github.com/anis-dr/claude-debug-agent/commit/8ec57e989c25f9b22fb8f836b0711f1528631c0a))
* add debug skill ([af340ac](https://github.com/anis-dr/claude-debug-agent/commit/af340ac5f25c8090d39b665f54841c872a1f6869))
* add generateSnippet helper ([ba6b0da](https://github.com/anis-dr/claude-debug-agent/commit/ba6b0da5056b481d234acdd767fcee696bbaceb4))
* add Hono HTTP capture server (DebugServer) ([cc80ed4](https://github.com/anis-dr/claude-debug-agent/commit/cc80ed4e6402a97375334bb7d377c96252dd8bca))
* add MCP server entrypoint (stdio transport) ([d91fcf2](https://github.com/anis-dr/claude-debug-agent/commit/d91fcf2544788bf16f07947168a81270d519f6e7))
* add MCP tool handlers and dispatch ([c59ad98](https://github.com/anis-dr/claude-debug-agent/commit/c59ad98d54ecdddda9ff12062d18f7a6b1c636c4))
* add plugin manifest and MCP server declaration ([3e56320](https://github.com/anis-dr/claude-debug-agent/commit/3e56320755d4732cfa9565a05e3f5ac3f379526d))
* initial v0.1.0 implementation ([6d161c1](https://github.com/anis-dr/claude-debug-agent/commit/6d161c1137891a5f32969d0d13712b05479e4bfa))


### Bug Fixes

* address final review (CI branch trigger, localhost bind, cleanups) ([6833a80](https://github.com/anis-dr/claude-debug-agent/commit/6833a809e9fe423f7f8fe860357fcfa77490828e))
* surface shutdown errors via .catch() instead of unhandled rejection ([ccad64c](https://github.com/anis-dr/claude-debug-agent/commit/ccad64c106c8d102812a7d0f7e8ecdcb1ae01ff3))

## [0.1.0] - 2026-04-28

Initial release. Port of `opencode-debug-agent` to a Claude Code plugin.

### Added

- 5 MCP tools: `debug_start`, `debug_stop`, `debug_read`, `debug_clear`, `debug_status`.
- Debug agent (`/agents debug`) with workflow prompt.
- Debug skill (`skills/debug`) usable from any agent.
- Hono HTTP capture server with CORS for browser instrumentation.
- Port persistence across sessions in `.claude/debug-agent/debug.port`.
- NDJSON log file at `.claude/debug-agent/debug.log`.
