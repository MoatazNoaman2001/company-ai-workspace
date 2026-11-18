import type { CallerContext } from './auth.js';

/**
 * One event per tool call (FR-12): who, which tool, a parameter summary, outcome and duration.
 * Never logs tokens, file contents or full search text.
 * Written to stdout and, when GOVERNANCE_URL is set, sent to governance-api's audit log (best effort:
 * an audit outage must not block read-only tools, and the stdout line remains as a fallback record).
 */
export function logToolCall(
  caller: CallerContext,
  tool: string,
  summary: Record<string, unknown>,
  startedAt: number,
  outcome: string,
): void {
  const ts = new Date().toISOString();
  const durationMs = Date.now() - startedAt;
  process.stdout.write(
    JSON.stringify({
      ts, event: 'tool_call', connector: 'google-workspace', tool, user: caller.userEmail || 'unknown',
      userId: caller.userId || undefined, summary, outcome, ms: durationMs,
    }) + '\n',
  );

  const url = process.env.GOVERNANCE_URL;
  const secret = process.env.GOV_MCP_SECRET;
  if (!url || !secret || !caller.userEmail) return;
  fetch(`${url.replace(/\/$/, '')}/v1/audit/tool-calls`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-service-name': 'mcp',
      'x-service-secret': secret,
      'x-actor-email': caller.userEmail,
    },
    body: JSON.stringify({ ts, connector: 'google-workspace', tool, outcome, durationMs, summary }),
    signal: AbortSignal.timeout(2000),
  })
    .then((r) => {
      if (!r.ok) process.stderr.write(JSON.stringify({ ts, event: 'audit_forward_failed', status: r.status }) + '\n');
    })
    .catch(() => process.stderr.write(JSON.stringify({ ts, event: 'audit_forward_failed', status: 'network' }) + '\n'));
}
