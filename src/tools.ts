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
