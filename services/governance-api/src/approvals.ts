import type { Db, Queryable } from './db.js';
import { HttpError, PolicyRefusal } from './errors.js';
import type { ApprovalRow, HandlerRegistry } from './handlers.js';
import { recordAudit } from './audit.js';

export interface ApprovalSettings {
  ttlHours: number;
  selfConfirmLimit: number;
  now: () => Date;
}

export interface CreateInput {
  connector: string;
  action: string;
  requesterEmail: string;
  target: { system: string; type?: string; id?: string; version?: string };
  summary: string;
  payload: unknown;
  before?: unknown;
  after?: unknown;
}

export interface Actor {
  email: string;
  isAdmin: boolean;
}

const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

/**
 * FR-11 approval queue. State machine:
 *   pending -> approved -> executing -> executed | failed
 *   pending -> rejected | expired | stale
 * Nothing executes without a recorded approval step, and each request executes at most once.
 */
export class ApprovalService {
  constructor(
    private readonly db: Db,
    private readonly handlers: HandlerRegistry,
    private readonly cfg: ApprovalSettings,
  ) {}

  async create(input: CreateInput): Promise<ApprovalRow> {
    const handler = this.handlers.get(input.connector, input.action);
    if (!handler) {
      throw new HttpError(422, 'unknown_action', `Action ${input.connector}/${input.action} is not registered.`);
    }
    const parsed = handler.payloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new HttpError(422, 'invalid_payload', 'The action payload is invalid.', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const risk = await handler.assessRisk(parsed.data, {
      requesterEmail: input.requesterEmail,
      selfConfirmLimit: this.cfg.selfConfirmLimit,
      targetId: input.target.id ?? null,
    });
    if (risk !== 'low') {
      // MVP: only Low-risk actions exist (BRD FR-11). Medium/High need approvers, which arrive in Phase 2.
      throw new PolicyRefusal(
        `This request is ${risk} risk and needs an approver. Approvals by managers arrive in Phase 2; only low-risk actions can be self-confirmed today.`,
      );
    }
    const now = this.cfg.now();
    const expires = new Date(now.getTime() + this.cfg.ttlHours * 3600_000);
    return this.db.tx(async (q) => {
      const { rows } = await q.query<ApprovalRow>(
        `INSERT INTO approval_requests
           (created_at, expires_at, status, risk_level, required_approvals, connector, action, requester_email,
            target_system, target_type, target_id, target_version, summary, payload, before_state, after_state)
         VALUES ($1,$2,'pending',$3,1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [now, expires, risk, input.connector, input.action, input.requesterEmail, input.target.system,
          input.target.type ?? null, input.target.id ?? null, input.target.version ?? null, input.summary,
          JSON.stringify(parsed.data), json(input.before), json(input.after)],
      );
      const row = rows[0];
      await recordAudit(q, {
        ts: now, kind: 'approval', actorEmail: input.requesterEmail, connector: input.connector,
        action: input.action, outcome: 'requested', requestId: row.id, details: { risk, summary: input.summary },
      });
      return row;
    });
  }

  async get(id: string, actor: Actor): Promise<ApprovalRow> {
    await this.sweepExpired();
    const { rows } = await this.db.query<ApprovalRow>('SELECT * FROM approval_requests WHERE id = $1', [id]);
    const row = rows[0];
    // Same answer for "missing" and "not yours", so ids cannot be probed.
    if (!row || (!actor.isAdmin && row.requester_email !== actor.email)) {
      throw new HttpError(404, 'not_found', 'Request not found.');
    }
    return row;
  }

  async list(actor: Actor, opts: { status?: string; requester?: string; limit: number }): Promise<ApprovalRow[]> {
    await this.sweepExpired();
    const requester = actor.isAdmin ? opts.requester : actor.email;
    const params: unknown[] = [];
    const where: string[] = [];
    if (requester) {
      params.push(requester.toLowerCase());
      where.push(`requester_email = $${params.length}`);
    }
    if (opts.status) {
      params.push(opts.status);
      where.push(`status = $${params.length}`);
    }
    params.push(opts.limit);
    const { rows } = await this.db.query<ApprovalRow>(
      `SELECT * FROM approval_requests ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows;
  }

  async decide(id: string, actor: Actor, decision: 'approve' | 'reject', reason?: string): Promise<ApprovalRow> {
    const row = await this.get(id, actor);
    if (decision === 'reject' && !reason?.trim()) {
      throw new HttpError(400, 'reason_required', 'A reason is required to reject a request.');
    }
    // MVP: low risk, self-confirm only. The requester approves; the requester or an Admin may reject.
    if (decision === 'approve' && row.requester_email !== actor.email) {
      throw new HttpError(403, 'not_allowed', 'Only the requester can confirm a low-risk request.');
    }
    const handler = this.handlers.get(row.connector, row.action);
    if (!handler) throw new HttpError(409, 'unknown_action', 'This action is no longer available.');

    // Freshness check before approving: never confirm a change to data that has moved on.
    if (decision === 'approve' && row.status === 'pending' && row.target_version && handler.currentVersion) {
      const current = await handler.currentVersion(row);
      if (current !== row.target_version) {
        await this.transition(row.id, 'pending', 'stale', actor.email, 'stale', {
          expected: row.target_version, current,
        });
        throw new HttpError(409, 'stale', 'The record changed after this request was created. Ask the assistant to prepare it again.');
      }
    }

    const decided = await this.db.tx(async (q) => {
      const { rows } = await q.query<ApprovalRow>('SELECT * FROM approval_requests WHERE id = $1 FOR UPDATE', [id]);
      const cur = rows[0];
      const now = this.cfg.now();
      if (cur.status === 'pending' && cur.expires_at <= now) {
        await q.query(`UPDATE approval_requests SET status = 'expired' WHERE id = $1`, [id]);
        await recordAudit(q, { ts: now, kind: 'approval', actorEmail: actor.email, connector: cur.connector,
          action: cur.action, outcome: 'expired', requestId: id });
        return { row: { ...cur, status: 'expired' }, decidedNow: false };
      }
      if (cur.status !== 'pending') return { row: cur, decidedNow: false };
      const status = decision === 'approve' ? 'approved' : 'rejected';
      const { rows: upd } = await q.query<ApprovalRow>(
        `UPDATE approval_requests SET status = $2, decided_at = $3, decided_by = $4, decision_reason = $5
          WHERE id = $1 RETURNING *`,
        [id, status, now, actor.email, reason ?? null],
      );
      await q.query(
        `INSERT INTO approval_steps (request_id, step, approver_role, approver_email, decision, reason, decided_at)
         VALUES ($1, 1, $2, $3, $4, $5, $6)`,
        [id, actor.email === cur.requester_email ? 'requester' : 'admin', actor.email, decision, reason ?? null, now],
      );
      await recordAudit(q, { ts: now, kind: 'approval', actorEmail: actor.email, connector: cur.connector,
        action: cur.action, outcome: status, requestId: id, details: reason ? { reason } : {} });
      return { row: upd[0], decidedNow: true };
    });

    if (decided.row.status === 'expired') {
      throw new HttpError(409, 'expired', 'This request expired. Ask the assistant to prepare it again.');
    }
    if (!decided.decidedNow) {
      throw new HttpError(409, 'already_decided', `This request is already ${decided.row.status}.`, { status: decided.row.status });
    }
    if (decided.row.status === 'rejected') return decided.row;
    return this.execute(decided.row);
  }

  /** Claim (approved -> executing) so a request can only run once, then run it. */
  private async execute(row: ApprovalRow): Promise<ApprovalRow> {
    const handler = this.handlers.get(row.connector, row.action)!;
    const claimed = await this.db.query<ApprovalRow>(
      `UPDATE approval_requests SET status = 'executing' WHERE id = $1 AND status = 'approved' RETURNING *`,
      [row.id],
    );
    if (!claimed.rows[0]) throw new HttpError(409, 'already_decided', 'This request is already being executed.');
    const started = Date.now();
    try {
      const result = await handler.execute(claimed.rows[0]);
      return await this.finish(row, 'executed', { result }, started);
    } catch (err) {
      const message = err instanceof HttpError ? err.message : 'The target system rejected or failed the action.';
      await this.finish(row, 'failed', { error: message }, started);
      throw new HttpError(502, 'execution_failed', message);
    }
  }

  private async finish(row: ApprovalRow, status: 'executed' | 'failed', out: { result?: unknown; error?: string }, started: number) {
    return this.db.tx(async (q) => {
      const now = this.cfg.now();
      const { rows } = await q.query<ApprovalRow>(
        `UPDATE approval_requests SET status = $2, executed_at = $3, result = $4, error = $5 WHERE id = $1 RETURNING *`,
        [row.id, status, now, json(out.result), out.error ?? null],
      );
      await recordAudit(q, { ts: now, kind: 'approval', actorEmail: row.requester_email, connector: row.connector,
        action: row.action, outcome: status, durationMs: Date.now() - started, requestId: row.id,
        details: out.error ? { error: out.error } : { result: out.result } });
      return rows[0];
    });
  }

  private async transition(id: string, from: string, to: string, actorEmail: string, outcome: string, details: Record<string, unknown>) {
    await this.db.tx(async (q: Queryable) => {
      const { rows } = await q.query<ApprovalRow>(
        `UPDATE approval_requests SET status = $3 WHERE id = $1 AND status = $2 RETURNING *`, [id, from, to]);
      if (rows[0]) {
        await recordAudit(q, { ts: this.cfg.now(), kind: 'approval', actorEmail, connector: rows[0].connector,
          action: rows[0].action, outcome, requestId: id, details });
      }
    });
  }

  /** Marks overdue pending requests as expired. Runs on reads and on a timer. */
  async sweepExpired(): Promise<number> {
    return this.db.tx(async (q) => {
      const now = this.cfg.now();
      const { rows } = await q.query<ApprovalRow>(
        `UPDATE approval_requests SET status = 'expired' WHERE status = 'pending' AND expires_at <= $1 RETURNING *`, [now]);
      for (const r of rows) {
        await recordAudit(q, { ts: now, kind: 'approval', actorEmail: r.requester_email, connector: r.connector,
          action: r.action, outcome: 'expired', requestId: r.id });
      }
      return rows.length;
    });
  }
}

/** Shape returned to callers: no internal-only columns, camelCase. */
export function present(row: ApprovalRow, dashboardUrl?: string) {
  return {
    id: row.id,
    status: row.status,
    riskLevel: row.risk_level,
    connector: row.connector,
    action: row.action,
    requester: row.requester_email,
    target: { system: row.target_system, type: row.target_type, id: row.target_id },
    summary: row.summary,
    before: row.before_state,
    after: row.after_state,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    reason: row.decision_reason,
    executedAt: row.executed_at,
    result: row.result,
    error: row.error,
    confirmUrl: dashboardUrl ? `${dashboardUrl.replace(/\/$/, '')}/actions/${row.id}` : undefined,
  };
}
