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
