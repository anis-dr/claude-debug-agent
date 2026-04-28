// Using the low-level `Server` (rather than `McpServer.registerTool`) because our
// tool input schemas are plain JSON Schema, while `registerTool` requires zod —
// pulling in zod and rewriting 5 tool schemas isn't worth it for v0.1.0. The
// `Server` class is marked @deprecated for "high-level use" but remains supported.
// eslint-disable-next-line @typescript-eslint/no-deprecated
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { debugServer } from './server';
import { dispatch, tools } from './tools';

// eslint-disable-next-line @typescript-eslint/no-deprecated
const server = new Server(
  { name: 'claude-debug-agent', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return dispatch({
    name: request.params.name,
    arguments: request.params.arguments as Record<string, unknown> | undefined,
  }) as Promise<CallToolResult>;
});

const transport = new StdioServerTransport();

// stdout is the MCP transport channel; only stderr is safe for diagnostics.
// process.exit(0) tears down the loop synchronously, so a tools/call response
// in flight when a signal lands may be lost. Acceptable for v0.1.0 — the client
// reconnects on plugin restart.
async function shutdown(signal: string): Promise<void> {
  process.stderr.write(`[claude-debug-agent] received ${signal}, exiting.\n`);
  await debugServer.stop();
  process.exit(0);
}

function onShutdownError(err: unknown): void {
  process.stderr.write(`[claude-debug-agent] shutdown error: ${String(err)}\n`);
  process.exit(1);
}

process.on('SIGINT', () => {
  shutdown('SIGINT').catch(onShutdownError);
});
process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch(onShutdownError);
});

await server.connect(transport);
