# claude-debug-agent — Plugin Architecture Design

**Date:** 2026-04-28
**Status:** Approved (pending user review of written spec)
**Author:** anis-dr

## Background

`opencode-debug-agent` is an existing OpenCode plugin that provides runtime debugging via HTTP instrumentation: a captured HTTP server receives `fetch()` calls inserted into user code, logs them as NDJSON, and returns them to the agent for analysis. It ships an agent prompt, a skill, and 5 tools (`debug_start`, `debug_stop`, `debug_read`, `debug_clear`, `debug_status`).

This spec describes a separate Claude Code plugin that delivers the same capabilities through Claude Code's plugin format (manifest + MCP server + agent + skill).

## Goals

- Direct port of the OpenCode plugin's behavior to Claude Code.
- Same 5 tools, same workflow, same instrumentation snippet pattern.
- Same agent prompt and skill content (ported to Claude Code formats).
- Installable via `/plugin marketplace add` from a public GitHub repo.

## Non-Goals

- No npm publish.
- No standalone CLI mode.
- No remote (non-localhost) capture.
- No log rotation, auth, or persistence beyond the singleton port file.
- No backward compatibility shim with the OpenCode plugin — separate project.

## Decisions

| Question      | Decision                                             |
| ------------- | ---------------------------------------------------- |
| Repo strategy | Fresh repo, separate from OpenCode plugin            |
| Runtime       | Bun + Hono (kept; users must have `bun` on PATH)     |
| Components    | Agent + Skill + MCP server with 5 tools              |
| Working dir   | `.claude/debug-agent/` inside the consumer's project |

## Architecture

Single Bun process per Claude Code session: an MCP server over stdio that hosts a Hono HTTP capture server in-process (started lazily by `debug_start`).

```
┌─────────────────────────────────────────────────┐
│  Claude Code (host)                             │
│   ↕ stdio (MCP protocol)                        │
│  ┌───────────────────────────────────────────┐  │
│  │  MCP Server (Bun process)                 │  │
│  │   • registers 5 tools                     │  │
│  │   • holds DebugServer singleton           │  │
│  │   ┌───────────────────────────────────┐   │  │
│  │   │ Hono HTTP server (lazy)           │   │  │
│  │   │   POST /log → append NDJSON       │   │  │
│  │   │   GET  /health                    │   │  │
│  │   └───────────────────────────────────┘   │  │
│  └───────────────────────────────────────────┘  │
│         ↑ HTTP                                  │
│  ┌──────┴──────────────────────────────────┐    │
│  │ User's instrumented code (browser/Node) │    │
│  │   fetch("http://localhost:PORT/log",…)  │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### Lifecycles

- **MCP server**: starts when Claude Code loads the plugin; dies on session end.
- **HTTP capture server**: starts on first `debug_start`; persists port to `.claude/debug-agent/debug.port`; lives until `debug_stop` or process exit.
- **Logs**: appended to `.claude/debug-agent/debug.log` (NDJSON, one entry per line).

## Project Layout

```
claude-debug-agent/
├── .claude-plugin/
│   ├── plugin.json          # manifest
│   └── marketplace.json     # one-plugin marketplace
├── .mcp.json                # declares MCP server (root, NOT in .claude-plugin/)
├── agents/
│   └── debug.md             # debug agent (frontmatter + prompt)
├── skills/
│   └── debug/
│       └── SKILL.md         # debug skill
├── src/
│   ├── index.ts             # MCP server entrypoint (stdio)
│   ├── tools.ts             # 5 MCP tool handlers
│   ├── server.ts            # Hono HTTP capture server (DebugServer class)
│   └── snippet.ts           # generateSnippet helper
├── test/
│   ├── server.test.ts
│   ├── tools.test.ts
│   └── snippet.test.ts
├── dist/
│   └── index.js             # bundled, committed
├── docs/
│   └── superpowers/specs/
├── package.json
├── tsconfig.json
├── .gitignore
├── .prettierrc
├── eslint.config.js
├── README.md
├── LICENSE                  # MIT
└── CHANGELOG.md
```

`dist/index.js` is committed so installs don't require a build step. CI verifies `dist/` matches source.

## Manifest Files

### `.claude-plugin/plugin.json`

```json
{
  "name": "claude-debug-agent",
  "description": "Runtime debugging for Claude Code — instrument code, capture execution data, analyze issues.",
  "version": "0.1.0",
  "author": { "name": "anis00723", "email": "anis00723@gmail.com" },
  "homepage": "https://github.com/anis-dr/claude-debug-agent",
  "repository": "https://github.com/anis-dr/claude-debug-agent",
  "license": "MIT",
  "keywords": ["claude-code", "claude-plugin", "debug", "debugging", "runtime", "mcp"]
}
```

### `.mcp.json` (plugin root)

```json
{
  "mcpServers": {
    "debug-agent": {
      "command": "bun",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/index.js"]
    }
  }
}
```

### `.claude-plugin/marketplace.json`

```json
{
  "name": "claude-debug-agent",
  "owner": { "name": "anis00723" },
  "plugins": [
    {
      "name": "claude-debug-agent",
      "description": "Runtime debugging via HTTP instrumentation.",
      "source": "."
    }
  ]
}
```

### Install flow

```
/plugin marketplace add anis-dr/claude-debug-agent
/plugin install claude-debug-agent@claude-debug-agent
```

## Components

### MCP server (`src/index.ts`)

Uses `@modelcontextprotocol/sdk` over stdio.

```ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools, dispatch } from './tools';

const server = new Server(
  { name: 'claude-debug-agent', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (req) => dispatch(req.params));

await server.connect(new StdioServerTransport());
```

The MCP server **must not write to stdout** — stdio is the protocol channel. All diagnostics go to `console.error` / stderr.

### Tools (`src/tools.ts`)

5 tools, identical semantics to the OpenCode version. Each returns `{ content: [{ type: "text", text: JSON.stringify(...) }] }` per MCP spec.

| Tool           | Args            | Returns                                                                           |
| -------------- | --------------- | --------------------------------------------------------------------------------- |
| `debug_start`  | `port?: number` | `{port, url, snippet, message}`                                                   |
| `debug_stop`   | —               | `{message}`                                                                       |
| `debug_read`   | `tail?: number` | `{entries: [...], count}` when entries exist; `{entries: [], message}` when empty |
| `debug_clear`  | —               | `{message}`                                                                       |
| `debug_status` | —               | `{active, port?, url?, snippet?, persistedPort?, hint?}`                          |

Schemas declared via the SDK's input schema format (JSON Schema). Tool descriptions copied verbatim from the OpenCode plugin's tool definitions.

### DebugServer (`src/server.ts`)

Ported from `opencode-debug-agent/src/server.ts` near-verbatim. Changes:

- `portFile` → `.claude/debug-agent/debug.port`
- `logFile` → `.claude/debug-agent/debug.log`
- `ensureGitignore()` adds `.claude/debug-agent/` to the consumer's `.gitignore`
- Same Hono routes (`/log`, `/health`), same CORS config, same NDJSON format, same singleton.

### Agent (`agents/debug.md`)

```yaml
---
name: debug
description: Runtime debugging — capture and analyze execution data via HTTP instrumentation. Use for hard-to-reproduce bugs, timing issues, or when you need ground-truth runtime values.
color: orange
---
<role>...</role>
<context>...</context>
<workflow>...</workflow>
<critical_rules>...</critical_rules>
<instrumentation_patterns>...</instrumentation_patterns>
<analysis_approach>...</analysis_approach>
```

Body is the existing `AGENT_PROMPT` from `opencode-debug-agent/src/index.ts` (lines 18–89), unchanged.

### Skill (`skills/debug/SKILL.md`)

```yaml
---
name: debug
description: Runtime debugging - instrument code, capture execution data, analyze issues. Use when investigating runtime bugs that need ground-truth variable values.
---
<purpose>...</purpose>
<tools>...</tools>
<workflow>...</workflow>
<critical_rules>...</critical_rules>
<instrumentation_examples>...</instrumentation_examples>
<labeling_strategy>...</labeling_strategy>
```

Body is the existing `DEBUG_SKILL.content` from `opencode-debug-agent/src/index.ts` (lines 94–147), unchanged.

## Data Flow

### Plugin install (one-time)

```
user → /plugin marketplace add anis-dr/claude-debug-agent
     → /plugin install claude-debug-agent@claude-debug-agent
Claude Code → reads .claude-plugin/plugin.json
            → reads .mcp.json → spawns `bun ${CLAUDE_PLUGIN_ROOT}/dist/index.js`
            → discovers agents/debug.md, skills/debug/SKILL.md
```

### Session start

```
Claude Code spawns MCP server (stdio) → ListTools handshake → 5 tools registered
DebugServer singleton constructed (idle, no HTTP server yet)
```

### Debug session

```
1. user → /agents debug   (or invokes skill from another agent)
2. agent → debug_start
   tool → DebugServer.start()
        → loads persisted port (if any), starts Hono on it
        → writes .claude/debug-agent/debug.port
        → ensures .gitignore entry
        → returns {port, url, snippet}
3. agent edits user code, inserts fetch(url+"/log", …) snippets
4. user reproduces bug
   instrumented code → POST /log → DebugServer appends NDJSON line to debug.log
5. agent → debug_read (optional tail)
        → flushes writer, reads debug.log, returns parsed entries
6. agent analyzes, identifies root cause
7. agent → debug_stop → server.stop(), flush + end writer
        → removes inserted fetch() lines from user code
```

### Session end

```
Claude Code closes stdio → MCP process exits
DebugServer (if running) cleanup: writer.flush(), writer.end(), server.stop()
debug.port persists for next session
```

### Edge cases

- Tool called when server already running → returns existing info, no double-start.
- `debug_read` flushes writer before reading.
- Process killed mid-session → next `debug_status` reads persisted port, returns hint to restart.
- Concurrent log writes → single Bun writer, one-line-per-write atomic for capture use.
- Persisted port already in use on restart → surface error clearly so the agent picks a fresh port via `debug_start({ port })`.

## Error Handling

| Boundary              | Policy                                                                         | Example                                             |
| --------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| MCP request handler   | Catch, return JSON `{error: string}` in tool result                            | `debug_start` fails → `{error: "Port 3000 in use"}` |
| HTTP `/log` handler   | Catch, return `{success: false, error: ...}` so instrumented code never throws | malformed body → still 200, error logged            |
| Internal (writer, fs) | Best-effort; silent fail for non-critical (gitignore append)                   | gitignore unwritable → don't block start            |

No retries. No automatic fallback ports unless `port?` arg is explicitly passed.

Diagnostics: `console.error` only (never stdout — that's the MCP channel).

## Testing

`bun test` (built-in `bun:test` runner — same as the existing OpenCode plugin's tests).

| File                   | Coverage                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/server.test.ts`  | start/stop, port persistence, `/log` POST → NDJSON line, `/log` with query string, `/log` with non-JSON body, CORS preflight, `readLogs(tail)`, `clearLogs`, gitignore creation |
| `test/tools.test.ts`   | each of 5 tools: happy path + already-running + not-running cases. Verify return shape (`content[0].text` is valid JSON with expected keys)                                     |
| `test/snippet.test.ts` | snippet contains correct port, valid JS                                                                                                                                         |

No mocks for HTTP — start the real Hono server on port 0, hit it. Reuses the existing OpenCode plugin's `server.test.ts` approach.

CI: GitHub Actions on `bun-version: latest`, runs:

```
bun install
bun test
bun run build
git diff --exit-code dist/   # ensure committed dist/ matches source
```

## Distribution

- Public GitHub repo: `anis-dr/claude-debug-agent`.
- Releases: tag-based (`v0.1.0`, …) via `release-please`, using the same config files (`release-please-config.json`, `.release-please-manifest.json`) carried over from the OpenCode repo and adapted to this package name.
- No npm publish — Claude Code installs from git via the marketplace.

## README Outline

1. What it is — one paragraph.
2. Requirements — Claude Code, `bun` on PATH.
3. Install
   ```
   /plugin marketplace add anis-dr/claude-debug-agent
   /plugin install claude-debug-agent@claude-debug-agent
   ```
4. Quick start — switch to `/agents debug`, describe issue.
5. Tools — table of 5.
6. Instrumentation pattern — fetch snippet example.
7. How it works — workflow steps.
8. Files written — `.claude/debug-agent/debug.log`, `.claude/debug-agent/debug.port`.
9. Development — `bun install`, `bun test`, `bun run build`.
10. License — MIT.

## Open Questions

None. All decisions confirmed during brainstorming on 2026-04-28.
