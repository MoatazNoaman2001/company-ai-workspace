import type { Db } from './db.js';

/**
 * Forward-only SQL migrations. The schema already carries the Phase 2 approval-matrix fields
 * (risk level, required approvals, per-step approvers, delegates), so Phase 2 needs no migration.
 */
export const MIGRATIONS: { version: string; sql: string }[] = [
  {
    version: '001_approvals_and_audit',
    sql: `
      CREATE TABLE approval_requests (
        id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at             timestamptz NOT NULL,
        expires_at             timestamptz NOT NULL,
        status                 text NOT NULL CHECK (status IN
                                 ('pending','approved','executing','executed','failed','rejected','expired','stale')),
        risk_level             text NOT NULL CHECK (risk_level IN ('low','medium','high')),
        required_approvals     int  NOT NULL DEFAULT 1 CHECK (required_approvals BETWEEN 1 AND 3),
        connector              text NOT NULL,
        action                 text NOT NULL,
        requester_email        text NOT NULL,
        department             text,
        target_system          text NOT NULL,
        target_type            text,
        target_id              text,
        target_version         text,
        summary                text NOT NULL,
        payload                jsonb NOT NULL,
        before_state           jsonb,
        after_state            jsonb,
        decided_at             timestamptz,
        decided_by             text,
        decision_reason        text,
        executed_at            timestamptz,
        result                 jsonb,
        error                  text
      );
      CREATE INDEX approval_requests_requester_idx ON approval_requests (requester_email, created_at DESC);
      CREATE INDEX approval_requests_pending_idx   ON approval_requests (expires_at) WHERE status = 'pending';

      -- One row per approval decision. MVP: one self-confirm step. Phase 2: department approver, then finance.
      CREATE TABLE approval_steps (
        id              bigserial PRIMARY KEY,
        request_id      uuid NOT NULL REFERENCES approval_requests(id),
        step            int  NOT NULL,
        approver_role   text NOT NULL,
        approver_email  text NOT NULL,
        on_behalf_of    text,
        decision        text NOT NULL CHECK (decision IN ('approve','reject')),
        reason          text,
        decided_at      timestamptz NOT NULL,
        UNIQUE (request_id, step)
      );

      CREATE TABLE audit_events (
        id           bigserial PRIMARY KEY,
        ts           timestamptz NOT NULL,
        kind         text NOT NULL CHECK (kind IN ('tool_call','approval','model_call','admin')),
        actor_email  text NOT NULL,
        connector    text,
        tool         text,
        action       text,
        outcome      text NOT NULL,
        duration_ms  int,
        request_id   uuid,
        details      jsonb NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE INDEX audit_events_ts_idx    ON audit_events (ts DESC);
      CREATE INDEX audit_events_actor_idx ON audit_events (actor_email, ts DESC);

      -- FR-12: the audit log is append-only, even for the application's own database user.
      CREATE FUNCTION audit_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_events is append-only';
      END $$;
      CREATE TRIGGER audit_events_no_change BEFORE UPDATE OR DELETE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
    `,
  },
];

export async function migrate(db: Db): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const { rows } = await db.query<{ version: string }>('SELECT version FROM schema_migrations');
  const done = new Set(rows.map((r) => r.version));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    await db.tx(async (q) => {
      await q.exec(m.sql);
      await q.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
    });
    applied.push(m.version);
  }
  return applied;
}
