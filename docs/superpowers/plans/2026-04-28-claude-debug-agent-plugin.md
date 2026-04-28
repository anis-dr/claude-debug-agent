# claude-debug-agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the existing `opencode-debug-agent` OpenCode plugin to a Claude Code plugin with the same 5 tools, debug agent, and skill.

**Architecture:** Single Bun process per Claude Code session. The process is an MCP server over stdio that lazily hosts a Hono HTTP capture server (started by `debug_start`). Logs append as NDJSON to `.claude/debug-agent/debug.log` in the consumer's project; port persists in `.claude/debug-agent/debug.port`.

**Tech Stack:** Bun (runtime + bundler + test runner), TypeScript (strict), Hono (HTTP), `@modelcontextprotocol/sdk` (MCP server). Distributed via Claude Code marketplace from a public GitHub repo.

**Working directory:** `/Users/mac/WebstormProjects/claude-debug-agent` (already created and `git init`-ed; spec already committed).

**Source for ports:** The existing OpenCode plugin lives at `/Users/mac/WebstormProjects/opencode-debug-agent/`. Several files are ported near-verbatim — those tasks point to specific source paths.

---

## File Structure

```
claude-debug-agent/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── .mcp.json
├── agents/
│   └── debug.md
├── skills/
│   └── debug/
│       └── SKILL.md
├── src/
│   ├── index.ts          # MCP server entrypoint (stdio)
│   ├── tools.ts          # tools[] + dispatch()
│   ├── server.ts         # DebugServer singleton (Hono)
│   └── snippet.ts        # generateSnippet()
├── test/
│   ├── snippet.test.ts
│   ├── server.test.ts
│   ├── tools.test.ts
│   └── e2e.test.ts       # smoke test over real stdio
├── dist/
│   └── index.js          # bundled, committed
├── docs/
│   └── superpowers/
│       ├── specs/
│       └── plans/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── package.json
├── tsconfig.json
├── .gitignore
├── .prettierrc
├── LICENSE
├── README.md
├── CHANGELOG.md
├── release-please-config.json
└── .release-please-manifest.json
```

**Single-responsibility per file:**

- `snippet.ts` — formats the instrumentation snippet given a URL.
- `server.ts` — runs and supervises the Hono capture server, owns the log file + port file.
- `tools.ts` — declares the 5 MCP tool definitions and routes calls to `server`/`snippet`.
- `index.ts` — wires the MCP transport; nothing else.

---

## Task 1: Project scaffolding

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.prettierrc`
- Create: `LICENSE`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "claude-debug-agent",
  "version": "0.1.0",
  "description": "Claude Code plugin for runtime debugging - capture and analyze execution data via HTTP instrumentation.",
  "type": "module",
  "private": true,
  "author": {
    "name": "anis00723",
    "email": "anis00723@gmail.com"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/anis-dr/claude-debug-agent.git"
  },
  "homepage": "https://github.com/anis-dr/claude-debug-agent",
  "keywords": ["claude-code", "claude-plugin", "debug", "debugging", "runtime", "mcp"],
  "scripts": {
    "build": "bun build ./src/index.ts --outdir dist --target bun --format esm",
    "test": "bun test",
    "format": "prettier --write \"**/*.{ts,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,json,md}\""
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "hono": "^4"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "prettier": "^3",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
*.log
.DS_Store
.env
.env.local
.bun/
.bun.lockb
.memory/
.claude/debug-agent/
```

Note: `dist/` is **not** ignored — the bundled `dist/index.js` is committed so the plugin is installable without a build step.

- [ ] **Step 4: Create `.prettierrc`**

```json
{
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "arrowParens": "always"
}
```

- [ ] **Step 5: Create `LICENSE`**

```
MIT License

Copyright (c) 2026 anis00723

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 6: Create `CHANGELOG.md`**

```markdown
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
```

- [ ] **Step 7: Install dependencies**

Run: `bun install`
Expected: dependencies resolve, `bun.lock` written, `node_modules/` populated. No errors.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json .gitignore .prettierrc LICENSE CHANGELOG.md bun.lock
git commit -m "chore: scaffold project (package, tsconfig, license, changelog)"
```

---

## Task 2: Snippet helper

**Files:**

- Create: `src/snippet.ts`
- Create: `test/snippet.test.ts`

- [ ] **Step 1: Write the failing test** — `test/snippet.test.ts`

```ts
import { describe, expect, it } from 'bun:test';
import { generateSnippet } from '../src/snippet';

describe('generateSnippet', () => {
  it('embeds the given URL into a fetch() call to /log', () => {
    const snippet = generateSnippet('http://localhost:54321');
    expect(snippet).toContain('http://localhost:54321/log');
    expect(snippet).toContain('fetch(');
  });

  it('includes the LABEL_HERE and YOUR_DATA placeholders', () => {
    const snippet = generateSnippet('http://localhost:1');
    expect(snippet).toContain('LABEL_HERE');
    expect(snippet).toContain('YOUR_DATA');
  });

  it('uses POST with application/json content type', () => {
    const snippet = generateSnippet('http://localhost:1');
    expect(snippet).toContain('"POST"');
    expect(snippet).toContain('"Content-Type": "application/json"');
  });

  it('produces syntactically valid JavaScript', () => {
    const snippet = generateSnippet('http://localhost:1');
    // Wrap in a no-op function so the placeholders don't trip the parser.
    const wrapped = `function _check(LABEL_HERE, YOUR_DATA) { return ${snippet}; }`;
    expect(() => new Function(wrapped)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/snippet.test.ts`
Expected: FAIL — `Cannot find module '../src/snippet'`.

- [ ] **Step 3: Write minimal implementation** — `src/snippet.ts`

```ts
export function generateSnippet(url: string): string {
  return `fetch("${url}/log", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({label: "LABEL_HERE", data: {YOUR_DATA}})
})`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/snippet.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/snippet.ts test/snippet.test.ts
git commit -m "feat: add generateSnippet helper"
```

---

## Task 3: DebugServer (HTTP capture server)

**Files:**

- Create: `src/server.ts`
- Create: `test/server.test.ts`

This is a near-direct port of `/Users/mac/WebstormProjects/opencode-debug-agent/src/server.ts`. The only behavioral changes are the working-directory paths (`.claude/debug-agent/...` instead of `.opencode/...`) and the gitignore entry.

- [ ] **Step 1: Write the failing tests** — `test/server.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { debugServer } from '../src/server';

describe('DebugServer /log endpoint', () => {
  beforeEach(async () => {
    await debugServer.stop();
    await debugServer.clearLogs();
  });

  afterEach(async () => {
    await debugServer.stop();
  });

  it('handles CORS preflight with custom headers', async () => {
    const { url } = await debugServer.start(0);
    const response = await fetch(`${url}/log`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3004',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers':
          'content-type,traceparent,x-trace-context,sec-ch-ua,sec-ch-ua-mobile,sec-ch-ua-platform',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-headers')).toBe('*');
  });

  it('allows private-network preflights for remote pages calling localhost', async () => {
    const { url } = await debugServer.start(0);
    const response = await fetch(`${url}/log`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Private-Network': 'true',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-private-network')).toBe('true');
  });

  it('accepts JSON logs with extra browser tracing headers', async () => {
    const { url } = await debugServer.start(0);
    const response = await fetch(`${url}/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        traceparent: '00-a52c6ccdb19700b6eaa3d97cc3e33239-3c0d667d9bdc56a3-01',
        'x-trace-context': '00-a52c6ccdb19700b6eaa3d97cc3e33239-3c0d667d9bdc56a3-01',
        'sec-ch-ua': '"Chromium";v="145"',
      },
      body: JSON.stringify({
        label: 'autosave-save-success',
        data: { reason: 'debounce' },
      }),
    });

    expect(response.status).toBe(200);

    const json = (await response.json()) as { success: boolean };
    expect(json.success).toBe(true);

    const entries = await debugServer.readLogs(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.label).toBe('autosave-save-success');
    expect(entries[0]?.data).toEqual({ reason: 'debounce' });
  });

  it('accepts text/plain payloads without failing JSON parsing', async () => {
    const { url } = await debugServer.start(0);
    const response = await fetch(`${url}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'plain-text-payload',
    });

    expect(response.status).toBe(200);

    const entries = await debugServer.readLogs(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.label).toBe('post');
    expect(entries[0]?.data).toBe('plain-text-payload');
  });

  it('accepts GET requests with querystring logs', async () => {
    const { url } = await debugServer.start(0);
    const response = await fetch(`${url}/log?label=autosave-replay&reason=debounce`, {
      method: 'GET',
    });

    expect(response.status).toBe(200);

    const entries = await debugServer.readLogs(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.label).toBe('autosave-replay');
    expect(entries[0]?.data).toEqual({ label: 'autosave-replay', reason: 'debounce' });
  });
});

describe('DebugServer lifecycle', () => {
  beforeEach(async () => {
    await debugServer.stop();
    await debugServer.clearLogs();
  });

  afterEach(async () => {
    await debugServer.stop();
  });

  it('reports active=false before start', () => {
    expect(debugServer.isRunning()).toBe(false);
    expect(debugServer.getInfo()).toEqual({ active: false });
  });

  it('reports active=true with port and URL after start', async () => {
    const { port, url } = await debugServer.start(0);
    expect(port).toBeGreaterThan(0);
    expect(url).toBe(`http://localhost:${port}`);

    const info = debugServer.getInfo();
    expect(info.active).toBe(true);
    expect(info.port).toBe(port);
    expect(info.url).toBe(url);
  });

  it('returns existing info if start() called when already running', async () => {
    const first = await debugServer.start(0);
    const second = await debugServer.start(0);
    expect(second.port).toBe(first.port);
  });

  it('persists port across stop/start cycles', async () => {
    const { port } = await debugServer.start(0);
    await debugServer.stop();
    const persisted = await debugServer.getPersistedPort();
    expect(persisted).toBe(port);
  });

  it('readLogs(tail) returns only the last N entries', async () => {
    const { url } = await debugServer.start(0);
    for (let i = 0; i < 5; i += 1) {
      await fetch(`${url}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: `entry-${i}`, data: { i } }),
      });
    }
    const entries = await debugServer.readLogs(2);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.label).toBe('entry-3');
    expect(entries[1]?.label).toBe('entry-4');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/server.test.ts`
Expected: FAIL — `Cannot find module '../src/server'`.

- [ ] **Step 3: Write the implementation** — `src/server.ts`

```ts
/**
 * Debug Server - Hono-based HTTP server for capturing runtime debug data.
 *
 * Features:
 * - CORS enabled for browser instrumentation
 * - Port persistence across sessions
 * - NDJSON log format
 * - Auto-flush with configurable interval
 */

import { Hono } from 'hono';
import { mkdir, appendFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface LogEntry {
  timestamp: string;
  label: string;
  data: unknown;
}

interface StartResult {
  port: number;
  url: string;
}

interface ServerInfo {
  active: boolean;
  port?: number;
  url?: string;
}

class DebugServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private writer: ReturnType<(typeof Bun.file)['prototype']['writer']> | null = null;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  private portFile = '.claude/debug-agent/debug.port';
  private logFile = '.claude/debug-agent/debug.log';

  async start(port?: number): Promise<StartResult> {
    if (this.server) {
      const existingPort = this.server.port ?? 0;
      return {
        port: existingPort,
        url: `http://localhost:${existingPort}`,
      };
    }

    const targetPort = port ?? (await this.loadPersistedPort()) ?? 0;

    const app = new Hono();

    app.use('/*', async (c, next) => {
      c.header('Access-Control-Allow-Origin', '*');
      c.header('Access-Control-Allow-Methods', '*');
      c.header('Access-Control-Allow-Headers', '*');
      c.header('Access-Control-Allow-Private-Network', 'true');
      c.header('Access-Control-Max-Age', '86400');

      if (c.req.method === 'OPTIONS') {
        return c.body(null, 204);
      }

      await next();
    });

    app.all('/log', async (c) => {
      try {
        const body = await this.parseRequestBody(c.req);
        const query = c.req.query();
        const labelFromBody = this.pickLabel(body);
        const labelFromQuery = this.pickLabel(query);

        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          label: labelFromBody ?? labelFromQuery ?? c.req.method.toLowerCase(),
          data: this.pickData(body, query),
        };

        await this.appendLog(entry);
        return c.json({ success: true });
      } catch {
        return c.json({ success: false, error: 'Failed to capture request' });
      }
    });

    app.get('/health', (c) => c.text('OK'));

    await mkdir(dirname(this.logFile), { recursive: true });
    await this.ensureGitignore();

    const file = Bun.file(this.logFile);
    this.writer = file.writer({ highWaterMark: 1024 * 8 });

    this.server = Bun.serve({
      fetch: app.fetch,
      port: targetPort,
    });

    const actualPort = this.server.port ?? 0;
    await this.persistPort(actualPort);

    this.flushInterval = setInterval(() => {
      this.writer?.flush();
    }, 5000);

    return {
      port: actualPort,
      url: `http://localhost:${actualPort}`,
    };
  }

  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    if (this.writer) {
      await this.writer.flush();
      await this.writer.end();
      this.writer = null;
    }

    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  getInfo(): ServerInfo {
    if (!this.server) {
      return { active: false };
    }
    return {
      active: true,
      port: this.server.port,
      url: `http://localhost:${this.server.port}`,
    };
  }

  async getPersistedPort(): Promise<number | null> {
    return this.loadPersistedPort();
  }

  async readLogs(tail?: number): Promise<LogEntry[]> {
    try {
      await this.writer?.flush();

      const file = Bun.file(this.logFile);
      if (!(await file.exists())) {
        return [];
      }

      const content = await file.text();
      const lines = content.trim().split('\n').filter(Boolean);

      const entries: LogEntry[] = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // skip malformed lines
        }
      }

      if (tail && tail > 0) {
        return entries.slice(-tail);
      }

      return entries;
    } catch {
      return [];
    }
  }

  async clearLogs(): Promise<void> {
    if (this.writer) {
      await this.writer.flush();
      await this.writer.end();
    }

    await Bun.write(this.logFile, '');

    if (this.server) {
      const file = Bun.file(this.logFile);
      this.writer = file.writer({ highWaterMark: 1024 * 8 });
    }
  }

  private async appendLog(entry: LogEntry): Promise<void> {
    if (!this.writer) {
      await mkdir(dirname(this.logFile), { recursive: true });
      const file = Bun.file(this.logFile);
      const existing = (await file.exists()) ? await file.text() : '';
      await Bun.write(this.logFile, existing + JSON.stringify(entry) + '\n');
      return;
    }

    this.writer.write(JSON.stringify(entry) + '\n');
  }

  private async parseRequestBody(req: {
    method: string;
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  }): Promise<unknown> {
    if (req.method === 'GET' || req.method === 'HEAD') {
      return null;
    }

    const contentType = req.header('content-type')?.toLowerCase() ?? '';

    if (contentType.includes('application/json')) {
      return req.json().catch(() => null);
    }

    const bodyText = await req.text().catch(() => '');

    if (!bodyText) {
      return null;
    }

    try {
      return JSON.parse(bodyText) as unknown;
    } catch {
      return bodyText;
    }
  }

  private pickLabel(payload: unknown): string | null {
    if (!this.isRecord(payload)) {
      return null;
    }

    const label = payload['label'];
    if (typeof label !== 'string' || label.trim().length === 0) {
      return null;
    }

    return label;
  }

  private pickData(body: unknown, query: Record<string, string>): unknown {
    if (this.isRecord(body) && 'data' in body) {
      return body['data'];
    }

    if (body !== null) {
      return body;
    }

    if (Object.keys(query).length > 0) {
      return query;
    }

    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private async loadPersistedPort(): Promise<number | null> {
    try {
      const file = Bun.file(this.portFile);
      if (!(await file.exists())) {
        return null;
      }
      const content = await file.text();
      const port = parseInt(content.trim(), 10);
      return isNaN(port) ? null : port;
    } catch {
      return null;
    }
  }

  private async persistPort(port: number): Promise<void> {
    await mkdir(dirname(this.portFile), { recursive: true });
    await Bun.write(this.portFile, String(port));
  }

  private async ensureGitignore(): Promise<void> {
    const gitignorePath = '.gitignore';
    const entries = ['.claude/debug-agent/'];

    try {
      let content = '';
      try {
        content = await readFile(gitignorePath, 'utf-8');
      } catch {
        // .gitignore doesn't exist; we'll create it.
      }

      const lines = content.split('\n').map((l) => l.trim());
      const toAdd: string[] = [];

      for (const entry of entries) {
        if (!lines.includes(entry)) {
          toAdd.push(entry);
        }
      }

      if (toAdd.length === 0) {
        return;
      }

      const newline = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
      await appendFile(gitignorePath, `${newline}${toAdd.join('\n')}\n`);
    } catch {
      // Best-effort; non-critical.
    }
  }
}

export const debugServer = new DebugServer();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/server.test.ts`
Expected: PASS — 10 tests pass (5 endpoint tests + 5 lifecycle tests).

- [ ] **Step 5: Verify runtime files were created in working dir**

Run: `ls -la .claude/debug-agent/`
Expected: `debug.log` and `debug.port` files exist (created during tests). They are gitignored — confirm with `git status`, neither should appear.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts test/server.test.ts .gitignore
git commit -m "feat: add Hono HTTP capture server (DebugServer)"
```

---

## Task 4: MCP tool handlers

**Files:**

- Create: `src/tools.ts`
- Create: `test/tools.test.ts`

`tools.ts` exports a `tools` array (MCP tool definitions with JSON-Schema input schemas) and a `dispatch` function that routes a `CallToolRequest`'s `params` to the right handler and returns the MCP-shaped result `{ content: [{ type: 'text', text: '...' }] }`.

- [ ] **Step 1: Write the failing tests** — `test/tools.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { dispatch, tools } from '../src/tools';
import { debugServer } from '../src/server';

function parseTextResult(result: { content: Array<{ type: string; text: string }> }) {
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe('text');
  return JSON.parse(result.content[0].text);
}

describe('tools array', () => {
  it('declares exactly the 5 expected tools', () => {
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'debug_clear',
      'debug_read',
      'debug_start',
      'debug_status',
      'debug_stop',
    ]);
  });

  it('each tool has a non-empty description', () => {
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it('each tool has a JSON-Schema input schema with type=object', () => {
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('debug_start exposes an optional port property', () => {
    const t = tools.find((x) => x.name === 'debug_start')!;
    expect(t.inputSchema.properties).toHaveProperty('port');
    expect(t.inputSchema.required ?? []).not.toContain('port');
  });

  it('debug_read exposes an optional tail property', () => {
    const t = tools.find((x) => x.name === 'debug_read')!;
    expect(t.inputSchema.properties).toHaveProperty('tail');
    expect(t.inputSchema.required ?? []).not.toContain('tail');
  });
});

describe('dispatch', () => {
  beforeEach(async () => {
    await debugServer.stop();
    await debugServer.clearLogs();
  });

  afterEach(async () => {
    await debugServer.stop();
  });

  it('debug_status returns active=false before start', async () => {
    const result = await dispatch({ name: 'debug_status', arguments: {} });
    const parsed = parseTextResult(result);
    expect(parsed.active).toBe(false);
  });

  it('debug_start returns port, url, and snippet', async () => {
    const result = await dispatch({ name: 'debug_start', arguments: {} });
    const parsed = parseTextResult(result);
    expect(parsed.port).toBeGreaterThan(0);
    expect(parsed.url).toBe(`http://localhost:${parsed.port}`);
    expect(parsed.snippet).toContain(`http://localhost:${parsed.port}/log`);
    expect(parsed.message).toContain('Debug server running');
  });

  it('debug_status returns active=true with snippet after start', async () => {
    await dispatch({ name: 'debug_start', arguments: {} });
    const result = await dispatch({ name: 'debug_status', arguments: {} });
    const parsed = parseTextResult(result);
    expect(parsed.active).toBe(true);
    expect(parsed.port).toBeGreaterThan(0);
    expect(parsed.snippet).toContain('/log');
  });

  it('debug_read returns empty entries when no logs captured', async () => {
    await dispatch({ name: 'debug_start', arguments: {} });
    const result = await dispatch({ name: 'debug_read', arguments: {} });
    const parsed = parseTextResult(result);
    expect(parsed.entries).toEqual([]);
    expect(parsed.message).toContain('No log entries');
  });

  it('debug_read returns entries and count after a log is captured', async () => {
    const startResult = await dispatch({ name: 'debug_start', arguments: {} });
    const { url } = parseTextResult(startResult);

    await fetch(`${url}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'test-label', data: { x: 1 } }),
    });

    const result = await dispatch({ name: 'debug_read', arguments: {} });
    const parsed = parseTextResult(result);
    expect(parsed.count).toBe(1);
    expect(parsed.entries[0].label).toBe('test-label');
    expect(parsed.entries[0].data).toEqual({ x: 1 });
  });

  it('debug_read with tail param returns only last N entries', async () => {
    const startResult = await dispatch({ name: 'debug_start', arguments: {} });
    const { url } = parseTextResult(startResult);

    for (let i = 0; i < 3; i += 1) {
      await fetch(`${url}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: `e-${i}`, data: { i } }),
      });
    }

    const result = await dispatch({ name: 'debug_read', arguments: { tail: 1 } });
    const parsed = parseTextResult(result);
    expect(parsed.count).toBe(1);
    expect(parsed.entries[0].label).toBe('e-2');
  });

  it('debug_clear removes captured entries', async () => {
    const startResult = await dispatch({ name: 'debug_start', arguments: {} });
    const { url } = parseTextResult(startResult);
    await fetch(`${url}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'x', data: {} }),
    });

    await dispatch({ name: 'debug_clear', arguments: {} });
    const result = await dispatch({ name: 'debug_read', arguments: {} });
    const parsed = parseTextResult(result);
    expect(parsed.entries).toEqual([]);
  });

  it('debug_stop returns a no-op message when server not running', async () => {
    const result = await dispatch({ name: 'debug_stop', arguments: {} });
    const parsed = parseTextResult(result);
    expect(parsed.message).toContain('not running');
  });

  it('debug_stop stops a running server', async () => {
    await dispatch({ name: 'debug_start', arguments: {} });
    expect(debugServer.isRunning()).toBe(true);
    const result = await dispatch({ name: 'debug_stop', arguments: {} });
    const parsed = parseTextResult(result);
    expect(parsed.message).toContain('stopped');
    expect(debugServer.isRunning()).toBe(false);
  });

  it('throws on unknown tool name', async () => {
    await expect(dispatch({ name: 'no_such_tool', arguments: {} })).rejects.toThrow(
      /unknown tool/i
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/tools.test.ts`
Expected: FAIL — `Cannot find module '../src/tools'`.

- [ ] **Step 3: Write the implementation** — `src/tools.ts`

```ts
import { debugServer } from './server';
import { generateSnippet } from './snippet';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface CallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

interface CallResult {
  content: Array<{ type: 'text'; text: string }>;
}

function textResult(payload: unknown): CallResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  };
}

export const tools: ToolDefinition[] = [
  {
    name: 'debug_start',
    description:
      'Start debug server to capture runtime data. Returns {port, url, snippet}. ALWAYS use the returned snippet - it has the correct port baked in.',
    inputSchema: {
      type: 'object',
      properties: {
        port: {
          type: 'number',
          description:
            'Specific port to use (optional). If not provided, reuses previous port or auto-selects.',
        },
      },
    },
  },
  {
    name: 'debug_stop',
    description:
      'Stop debug server and flush logs to disk. Call this when debugging is complete, then remove all instrumentation.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'debug_read',
    description:
      'Read captured logs. Returns {entries: [{timestamp, label, data}...], count}. Use tail param for recent entries only.',
    inputSchema: {
      type: 'object',
      properties: {
        tail: {
          type: 'number',
          description: 'Return only the last N entries. If not provided, returns all entries.',
        },
      },
    },
  },
  {
    name: 'debug_clear',
    description: 'Clear the debug log file. Use to start fresh capture session.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'debug_status',
    description:
      'Check server state. Returns {active, port, url, snippet} if running, or {persistedPort} from previous session. Call this first when resuming.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export async function dispatch(params: CallParams): Promise<CallResult> {
  const args = params.arguments ?? {};

  switch (params.name) {
    case 'debug_start': {
      const port = typeof args.port === 'number' ? args.port : undefined;
      const result = await debugServer.start(port);
      return textResult({
        port: result.port,
        url: result.url,
        snippet: generateSnippet(result.url),
        message: `Debug server running on port ${result.port}. Use the snippet to instrument code.`,
      });
    }

    case 'debug_stop': {
      if (!debugServer.isRunning()) {
        return textResult({ message: 'Debug server is not running.' });
      }
      await debugServer.stop();
      return textResult({
        message: 'Debug server stopped. Logs preserved in .claude/debug-agent/debug.log',
      });
    }

    case 'debug_read': {
      const tail = typeof args.tail === 'number' ? args.tail : undefined;
      const entries = await debugServer.readLogs(tail);
      if (entries.length === 0) {
        return textResult({
          entries: [],
          message:
            'No log entries found. Make sure the debug server is running and code is instrumented.',
        });
      }
      return textResult({ entries, count: entries.length });
    }

    case 'debug_clear': {
      await debugServer.clearLogs();
      return textResult({ message: 'Debug log cleared.' });
    }

    case 'debug_status': {
      const info = debugServer.getInfo();
      if (info.active && info.url) {
        return textResult({
          active: true,
          port: info.port,
          url: info.url,
          snippet: generateSnippet(info.url),
        });
      }

      const persistedPort = await debugServer.getPersistedPort();
      return textResult({
        active: false,
        persistedPort,
        hint: persistedPort
          ? `Previous session used port ${persistedPort}. Call debug_start to reuse it.`
          : 'No debug server configured. Call debug_start to begin.',
      });
    }

    default:
      throw new Error(`Unknown tool: ${params.name}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/tools.test.ts`
Expected: PASS — all `tools array` tests + all `dispatch` tests pass.

- [ ] **Step 5: Run the full test suite**

Run: `bun test`
Expected: All tests across `snippet.test.ts`, `server.test.ts`, `tools.test.ts` pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools.ts test/tools.test.ts
git commit -m "feat: add MCP tool handlers and dispatch"
```

---

## Task 5: MCP server entrypoint

**Files:**

- Create: `src/index.ts`

The entrypoint wires the MCP SDK's `Server` to `tools` and `dispatch`, and connects it over stdio. No tests in this task — Task 13 (E2E) verifies the wiring end-to-end through real stdio.

- [ ] **Step 1: Write the entrypoint** — `src/index.ts`

```ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { dispatch, tools } from './tools';

const server = new Server(
  { name: 'claude-debug-agent', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return dispatch({
    name: request.params.name,
    arguments: request.params.arguments as Record<string, unknown> | undefined,
  });
});

const transport = new StdioServerTransport();

// stdout is the MCP transport channel; only stderr is safe for diagnostics.
process.on('SIGINT', () => {
  process.stderr.write('[claude-debug-agent] received SIGINT, exiting.\n');
  process.exit(0);
});

await server.connect(transport);
```

- [ ] **Step 2: Verify it starts without crashing**

Run: `echo '' | timeout 1 bun src/index.ts; echo "exit=$?"`
Expected: process starts, blocks on stdio, then `timeout` kills it (`exit=124`). No "import error" or "module not found" output. If you see a stack trace mentioning `@modelcontextprotocol/sdk`, run `bun install` again.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add MCP server entrypoint (stdio transport)"
```

---

## Task 6: Build bundle

**Files:**

- Modify: nothing in `src/`
- Create: `dist/index.js`

- [ ] **Step 1: Run the build**

Run: `bun run build`
Expected: `bun build` succeeds. `dist/index.js` is created (single bundled file). No errors.

- [ ] **Step 2: Verify the bundle starts**

Run: `echo '' | timeout 1 bun dist/index.js; echo "exit=$?"`
Expected: same behavior as Task 5 Step 2 — process starts, blocks on stdio, killed by timeout. `exit=124`.

- [ ] **Step 3: Send a tools/list request to the bundle to confirm protocol works**

Run:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | timeout 2 bun dist/index.js | head -20
```

Expected: stdout contains a JSON-RPC response with `"id":2` and a `"tools"` array containing 5 entries (`debug_start`, `debug_stop`, `debug_read`, `debug_clear`, `debug_status`).

- [ ] **Step 4: Commit the bundle**

```bash
git add dist/index.js
git commit -m "build: commit bundled dist/index.js for plugin distribution"
```

---

## Task 7: Plugin manifest files

**Files:**

- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `.mcp.json`

- [ ] **Step 1: Create `.claude-plugin/plugin.json`**

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

- [ ] **Step 2: Create `.mcp.json` at the plugin root**

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

- [ ] **Step 3: Create `.claude-plugin/marketplace.json`**

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

- [ ] **Step 4: Validate JSON files parse**

Run: `for f in .claude-plugin/plugin.json .claude-plugin/marketplace.json .mcp.json; do echo "$f"; bun -e "JSON.parse(await Bun.file('$f').text()); console.log('  ok')"; done`
Expected: each file prints its name and `ok`.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/ .mcp.json
git commit -m "feat: add plugin manifest and MCP server declaration"
```

---

## Task 8: Debug agent

**Files:**

- Create: `agents/debug.md`

- [ ] **Step 1: Create `agents/debug.md`**

````markdown
---
name: debug
description: Runtime debugging — capture and analyze execution data via HTTP instrumentation. Use for hard-to-reproduce bugs, timing issues, or when you need ground-truth runtime values.
color: orange
---

<role>
You are a debugging specialist. You help users find runtime bugs by instrumenting their code to capture execution data.
</role>

<context>
The debug server receives HTTP POST requests from instrumented code and logs them. You insert fetch() calls at strategic points to capture variable state, then analyze the logs to identify issues.
</context>

<workflow>
Step 1: Start the debug server
- Call `debug_start`
- Save the returned snippet - it contains the correct port

Step 2: Instrument the code

- Insert the snippet at suspected problem areas
- Replace `LABEL_HERE` with descriptive names (e.g., "before-db-query", "after-parse")
- Replace `YOUR_DATA` with variables to capture (e.g., `{userId, response, error}`)

Step 3: Capture data

- Ask user to reproduce the issue
- The server logs each fetch() call with timestamp

Step 4: Analyze

- Call `debug_read` to get all captured entries
- Compare expected vs actual values
- Identify where behavior diverges from expectation

Step 5: Cleanup

- Call `debug_stop`
- Remove ALL instrumentation fetch() calls from the code
  </workflow>

<critical_rules>

- ALWAYS use the snippet from `debug_start` - never hardcode ports
- Call `debug_status` first if resuming or if instrumentations already exist
- Search for existing `localhost:\d+/log` patterns before adding new ones
- ALWAYS remove instrumentation after debugging is complete
  </critical_rules>

<instrumentation_patterns>

```javascript
// Before async operation
fetch('http://localhost:PORT/log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ label: 'pre-api', data: { input, config } }),
});

// After receiving result
fetch('http://localhost:PORT/log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ label: 'post-api', data: { result, status } }),
});

// In error handler
fetch('http://localhost:PORT/log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ label: 'error-caught', data: { error: e.message, stack: e.stack } }),
});
```
````

</instrumentation_patterns>

<analysis_approach>
When reading logs:

1. Check timestamps - are operations happening in expected order?
2. Compare pre/post values - did the operation transform data correctly?
3. Look for missing labels - did execution reach expected points?
4. Examine error data - what was the actual failure?
5. Track state changes - how did variables evolve?
   </analysis_approach>

````

- [ ] **Step 2: Verify frontmatter parses**

Run:
```bash
bun -e '
const text = await Bun.file("agents/debug.md").text();
const m = text.match(/^---\n([\s\S]*?)\n---/);
if (!m) { console.error("no frontmatter"); process.exit(1); }
const lines = m[1].split("\n").filter(Boolean);
const fm = Object.fromEntries(lines.map(l => { const i = l.indexOf(":"); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; }));
console.log(fm);
if (fm.name !== "debug") { console.error("name mismatch"); process.exit(1); }
console.log("ok");
'
````

Expected: prints `{ name: 'debug', description: '...', color: 'orange' }` then `ok`.

- [ ] **Step 3: Commit**

```bash
git add agents/debug.md
git commit -m "feat: add debug agent"
```

---

## Task 9: Debug skill

**Files:**

- Create: `skills/debug/SKILL.md`

- [ ] **Step 1: Create `skills/debug/SKILL.md`**

````markdown
---
name: debug
description: Runtime debugging - instrument code, capture execution data, analyze issues. Use when investigating runtime bugs that need ground-truth variable values.
---

<purpose>
Capture runtime data by inserting fetch() calls into code. The debug server receives these calls and logs execution state for analysis.
</purpose>

<tools>
| Tool | Purpose | Returns |
|------|---------|---------|
| `debug_start` | Start capture server | `{port, url, snippet}` |
| `debug_read` | Get captured logs | `{entries: [{timestamp, label, data}...]}` |
| `debug_stop` | Stop server | confirmation |
| `debug_status` | Check server state | `{active, port?, persistedPort?}` |
| `debug_clear` | Clear log file | confirmation |
</tools>

<workflow>
1. `debug_start` - get the snippet with correct port
2. Insert snippet at strategic locations (replace LABEL_HERE, YOUR_DATA)
3. User reproduces the issue
4. `debug_read` - analyze captured data
5. `debug_stop` when done
6. Remove all instrumentation
</workflow>

<critical_rules>

- ALWAYS use the snippet from `debug_start` response - never hardcode ports
- Call `debug_status` first if resuming a session
- Check for existing `localhost:\d+/log` patterns before instrumenting
- Remove ALL fetch instrumentation after debugging
  </critical_rules>

<instrumentation_examples>

```javascript
// Capture state before async operation
fetch('http://localhost:PORT/log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ label: 'pre-fetch', data: { userId, params } }),
});

// Capture response/error
fetch('http://localhost:PORT/log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ label: 'post-fetch', data: { status, body, error } }),
});
```
````

</instrumentation_examples>

<labeling_strategy>
Use descriptive labels that indicate:

- Location: "auth-middleware", "api-handler", "db-query"
- Timing: "pre-", "post-", "during-"
- Context: "user-input", "parsed-config", "error-caught"
  </labeling_strategy>

````

- [ ] **Step 2: Verify file is non-empty and frontmatter is present**

Run: `head -4 skills/debug/SKILL.md`
Expected: starts with `---`, contains `name: debug`, then `description:`, then `---`.

- [ ] **Step 3: Commit**

```bash
git add skills/debug/SKILL.md
git commit -m "feat: add debug skill"
````

---

## Task 10: README

**Files:**

- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
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
```

/plugin marketplace add anis-dr/claude-debug-agent
/plugin install claude-debug-agent@claude-debug-agent

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

debug_start # Start server, get an instrumentation snippet
debug_status # Check if server running, get port
debug_read # Read captured logs
debug_read(tail: 10) # Last 10 entries
debug_clear # Clear log file
debug_stop # Stop server

````

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
````

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

````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README"
````

---

## Task 11: GitHub Actions CI

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run tests
        run: bun test

      - name: Build bundle
        run: bun run build

      - name: Verify committed dist/ is in sync with src/
        run: |
          if ! git diff --exit-code dist/; then
            echo "::error::dist/ is out of sync with src/. Run 'bun run build' and commit the result."
            exit 1
          fi

      - name: Format check
        run: bun run format:check
```

- [ ] **Step 2: Validate YAML parses**

Run: `bun -e 'const t = await Bun.file(".github/workflows/ci.yml").text(); if (!t.includes("oven-sh/setup-bun")) throw new Error("missing setup-bun"); console.log("ok")'`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions CI workflow"
```

---

## Task 12: release-please configuration

**Files:**

- Create: `release-please-config.json`
- Create: `.release-please-manifest.json`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `release-please-config.json`**

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    ".": {}
  },
  "include-v-in-tag": true,
  "include-component-in-tag": false,
  "release-type": "node",
  "bump-minor-pre-major": true
}
```

- [ ] **Step 2: Create `.release-please-manifest.json`**

```json
{
  ".": "0.1.0"
}
```

- [ ] **Step 3: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

- [ ] **Step 4: Commit**

```bash
git add release-please-config.json .release-please-manifest.json .github/workflows/release.yml
git commit -m "ci: add release-please configuration"
```

---

## Task 13: End-to-end smoke test

**Files:**

- Create: `test/e2e.test.ts`

This task spawns the bundled MCP server as a child process, speaks JSON-RPC over its stdio, and asserts that `tools/list` returns the 5 expected tools and that `tools/call` for `debug_status` returns `active=false`.

- [ ] **Step 1: Write the test** — `test/e2e.test.ts`

```ts
import { afterAll, describe, expect, it } from 'bun:test';

interface RpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

async function readUntilId(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  id: number,
  timeoutMs = 4000
): Promise<RpcResponse> {
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx = buffer.indexOf('\n');
    while (newlineIdx >= 0) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (line.length > 0) {
        try {
          const parsed = JSON.parse(line) as RpcResponse;
          if (parsed.id === id) {
            return parsed;
          }
        } catch {
          // ignore non-JSON lines
        }
      }
      newlineIdx = buffer.indexOf('\n');
    }
  }
  throw new Error(`timed out waiting for response with id=${id}`);
}

const proc = Bun.spawn(['bun', 'dist/index.js'], {
  stdin: 'pipe',
  stdout: 'pipe',
  stderr: 'pipe',
});

afterAll(async () => {
  proc.kill();
  await proc.exited;
});

async function send(req: object): Promise<void> {
  proc.stdin.write(JSON.stringify(req) + '\n');
  await proc.stdin.flush?.();
}

describe('MCP server (bundled dist/index.js)', () => {
  it('responds to initialize, tools/list, and tools/call over stdio', async () => {
    const reader = proc.stdout.getReader();

    await send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'e2e-test', version: '0' },
      },
    });
    const initRes = await readUntilId(reader, 1);
    expect(initRes.error).toBeUndefined();
    expect(initRes.result).toBeDefined();

    await send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    await send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const listRes = await readUntilId(reader, 2);
    expect(listRes.error).toBeUndefined();
    const result = listRes.result as { tools: Array<{ name: string }> };
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'debug_clear',
      'debug_read',
      'debug_start',
      'debug_status',
      'debug_stop',
    ]);

    await send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'debug_status', arguments: {} },
    });
    const statusRes = await readUntilId(reader, 3);
    expect(statusRes.error).toBeUndefined();
    const statusResult = statusRes.result as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(statusResult.content[0].text) as { active: boolean };
    expect(parsed.active).toBe(false);

    reader.releaseLock();
  });
});
```

- [ ] **Step 2: Run the smoke test**

Run: `bun test test/e2e.test.ts`
Expected: PASS — initialize/list/call all succeed, 5 tools returned, `debug_status` reports `active=false`.

- [ ] **Step 3: Run the full test suite to confirm nothing regressed**

Run: `bun test`
Expected: all tests across `snippet.test.ts`, `server.test.ts`, `tools.test.ts`, `e2e.test.ts` pass.

- [ ] **Step 4: Commit**

```bash
git add test/e2e.test.ts
git commit -m "test: add end-to-end MCP smoke test over stdio"
```

---

## Task 14: Final formatting + README install verification

**Files:**

- Modify: any files touched by `prettier --write`

- [ ] **Step 1: Run prettier across the repo**

Run: `bun run format`
Expected: prettier rewrites any inconsistently formatted files. Most likely no-op since we wrote them with the right style.

- [ ] **Step 2: Run format check**

Run: `bun run format:check`
Expected: PASS — all files formatted.

- [ ] **Step 3: Run the full test suite one more time**

Run: `bun test`
Expected: all tests pass.

- [ ] **Step 4: Verify the bundle is up to date**

Run: `bun run build && git diff --exit-code dist/`
Expected: exit code 0 — dist/ matches the built output.

- [ ] **Step 5: Commit any formatting changes (if any)**

```bash
git status
# If anything changed:
git add -A
git commit -m "style: run prettier across repo"
```

- [ ] **Step 6: Print the install instructions for the user**

After the user pushes to `github.com/anis-dr/claude-debug-agent` and creates a `v0.1.0` GitHub release (release-please will open the PR for this), users install with:

```
/plugin marketplace add anis-dr/claude-debug-agent
/plugin install claude-debug-agent@claude-debug-agent
```

Verification steps for the user (manual):

1. In a separate Claude Code session, run the install commands above.
2. Run `/plugin` and confirm `claude-debug-agent` is listed and enabled.
3. Run `/agents debug` — agent should be available.
4. From the agent, ask it to "start the debug server". `debug_start` should return a port and snippet.
5. Confirm `.claude/debug-agent/debug.port` and `.claude/debug-agent/debug.log` are created in the test project.

---

## Self-Review Notes

After writing, the plan was self-reviewed against `docs/superpowers/specs/2026-04-28-plugin-architecture-design.md`:

- **Spec coverage:** every spec section is realized — manifest (Task 7), MCP server (Tasks 4–6), DebugServer (Task 3), agent (Task 8), skill (Task 9), data flow / lifecycles (Tasks 5 + 13), error handling (Task 4 dispatch + Task 5 SIGINT + Task 3 best-effort gitignore), testing (Tasks 2/3/4/13), distribution (Tasks 11 + 12 + 14).
- **Placeholder scan:** no `TBD`/`TODO`. All code is concrete.
- **Type consistency:** `tools` array shape (`{name, description, inputSchema}`) used identically in Task 4's tests and Task 5's import. `dispatch` signature `(params: {name, arguments?}) => Promise<{content: [{type, text}]}>` used identically in Task 4's tests and Task 5's entrypoint adapter.
- **Out-of-scope guards:** ESLint omitted (YAGNI for v0.1.0; prettier covers basic style); npm publish omitted; CLI mode omitted.
