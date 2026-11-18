import type { CallerContext } from './auth.js';

/**
 * One JSON line per tool call (FR-12 input until governance-api exists).
 * Records who, which tool, a parameter summary, outcome and duration.
 * Never logs tokens, file contents or full search text.
 */
export function logToolCall(
  caller: CallerContext,
  tool: string,
  summary: Record<string, unknown>,
  startedAt: number,
  outcome: string,
): void {
  process.stdout.write(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: 'tool_call',
      connector: 'google-workspace',
      tool,
      user: caller.userEmail || 'unknown',
      userId: caller.userId || undefined,
      summary,
      outcome,
      ms: Date.now() - startedAt,
    }) + '\n',
  );
}
