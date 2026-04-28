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
