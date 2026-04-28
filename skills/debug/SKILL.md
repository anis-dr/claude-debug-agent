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
fetch("http://localhost:PORT/log", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({label: "pre-fetch", data: {userId, params}})
})

// Capture response/error
fetch("http://localhost:PORT/log", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({label: "post-fetch", data: {status, body, error}})
})
```
</instrumentation_examples>

<labeling_strategy>
Use descriptive labels that indicate:
- Location: "auth-middleware", "api-handler", "db-query"
- Timing: "pre-", "post-", "during-"
- Context: "user-input", "parsed-config", "error-caught"
</labeling_strategy>
