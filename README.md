# claude-debug-agent

Claude Code plugin for runtime debugging — capture and analyze execution data via HTTP instrumentation.

## Features

- **Debug Agent** (`/agents debug`) — primary agent specialized for debugging workflows.
- **Debug Skill** — usable from any agent via the skill system.
- **MCP server** — 5 tools registered in Claude Code: `debug_start`, `debug_stop`, `debug_read`, `debug_clear`, `debug_status`.
- **HTTP capture server** — Hono-based, CORS enabled for browser instrumentation.
- **Port persistence** — server remembers its port across sessions.

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code).
- [Bun](https://bun.sh) on your `PATH` (the plugin runs the bundled MCP server with `bun`).

## Installation

### From the marketplace (recommended)

```
/plugin marketplace add anis-dr/claude-debug-agent
/plugin install claude-debug-agent@claude-debug-agent
```

### Local testing (without publishing)

Clone the repo and point Claude Code at it directly:

```bash
git clone https://github.com/anis-dr/claude-debug-agent.git
claude --plugin-dir ./claude-debug-agent
```

## Usage

### With the debug agent

Switch to the debug agent and describe the issue:

```
/agents debug
```

The agent will:

1. Start the debug server (`debug_start`).
2. Instrument suspected code paths with `fetch()` calls.
3. Ask you to reproduce the issue.
4. Read the captured logs (`debug_read`).
5. Identify the problem.
6. Clean up instrumentation and stop the server.

### From any agent (skill)

```
Use the debug skill and help me track down this API timeout.
```

### Direct tool calls

```
debug_start          # Start server, get an instrumentation snippet
debug_status         # Check if server running, get port
debug_read           # Read captured logs
debug_read(tail: 10) # Last 10 entries
debug_clear          # Clear log file
debug_stop           # Stop server
```

## How it works

1. **Start server** — `debug_start` launches a Hono HTTP server (in-process with the MCP server) and returns a ready-to-use `fetch()` snippet with the correct port.
2. **Instrument code** — insert the snippet at strategic locations to capture runtime data.
3. **Reproduce issue** — run your code normally; instrumented `fetch()` calls log to the server.
4. **Analyze logs** — `debug_read` returns captured data as structured JSON.
5. **Clean up** — `debug_stop` and remove instrumentation.

### Instrumentation snippet

```javascript
// Snippet returned by debug_start (port baked in):
fetch("http://localhost:54321/log", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ label: "LABEL_HERE", data: { YOUR_DATA } }),
});

// Used in code:
fetch("http://localhost:54321/log", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ label: "before-api", data: { userId, params } }),
});
```

## Files written

In the consumer project's working directory:

- `.claude/debug-agent/debug.log` — NDJSON log file.
- `.claude/debug-agent/debug.port` — persisted port number.

Both are auto-added to `.gitignore` on first run.

## Development

```bash
bun install
bun test
bun run build  # rebuilds dist/index.js
```

The bundled `dist/index.js` is committed so users don't need to build after install. CI verifies the committed bundle is in sync with `src/`.

## License

MIT — see [LICENSE](./LICENSE).
