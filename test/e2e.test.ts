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
