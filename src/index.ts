import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { debugServer } from './server';
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
  }) as Promise<CallToolResult>;
});

const transport = new StdioServerTransport();

// stdout is the MCP transport channel; only stderr is safe for diagnostics.
async function shutdown(signal: string): Promise<void> {
  process.stderr.write(`[claude-debug-agent] received ${signal}, exiting.\n`);
  await debugServer.stop();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

await server.connect(transport);
