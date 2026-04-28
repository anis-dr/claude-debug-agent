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
