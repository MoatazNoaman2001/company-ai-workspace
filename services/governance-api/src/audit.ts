import type { Queryable } from './db.js';

export type AuditKind = 'tool_call' | 'approval' | 'model_call' | 'admin';

export interface AuditEvent {
  ts: Date;
  kind: AuditKind;
  actorEmail: string;
  connector?: string | null;
  tool?: string | null;
  action?: string | null;
  outcome: string;
  durationMs?: number | null;
  requestId?: string | null;
  details?: Record<string, unknown>;
}

export async function recordAudit(q: Queryable, e: AuditEvent): Promise<void> {
  await q.query(
    `INSERT INTO audit_events (ts, kind, actor_email, connector, tool, action, outcome, duration_ms, request_id, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [e.ts, e.kind, e.actorEmail.toLowerCase(), e.connector ?? null, e.tool ?? null, e.action ?? null, e.outcome,
      e.durationMs ?? null, e.requestId ?? null, JSON.stringify(e.details ?? {})],
  );
}

export interface AuditFilter {
  actor?: string;
  connector?: string;
  kind?: AuditKind;
  from?: Date;
  to?: Date;
  limit: number;
}

export interface AuditRow {
  id: string;
  ts: Date;
  kind: string;
  actor_email: string;
  connector: string | null;
  tool: string | null;
  action: string | null;
  outcome: string;
  duration_ms: number | null;
  request_id: string | null;
  details: unknown;
}

export async function queryAudit(q: Queryable, f: AuditFilter): Promise<AuditRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (f.actor) add('actor_email = ?', f.actor.toLowerCase());
  if (f.connector) add('connector = ?', f.connector);
  if (f.kind) add('kind = ?', f.kind);
  if (f.from) add('ts >= ?', f.from);
  if (f.to) add('ts < ?', f.to);
  params.push(f.limit);
  const { rows } = await q.query<AuditRow>(
    `SELECT id::text, ts, kind, actor_email, connector, tool, action, outcome, duration_ms, request_id, details
       FROM audit_events ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ts DESC, id DESC LIMIT $${params.length}`,
    params,
  );
  return rows;
}

/** CSV with quoting and spreadsheet-formula neutralising (cells starting with = + - @ get a leading '). */
export function toCsv(rows: AuditRow[]): string {
  const cols = ['id', 'ts', 'kind', 'actor_email', 'connector', 'tool', 'action', 'outcome', 'duration_ms', 'request_id', 'details'] as const;
  const cell = (v: unknown): string => {
    let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}
