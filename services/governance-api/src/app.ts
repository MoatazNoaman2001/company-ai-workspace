import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { ApprovalService, present } from './approvals.js';
import { queryAudit, recordAudit, toCsv } from './audit.js';
import { requireAdmin, requireService } from './auth.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { HttpError } from './errors.js';
import type { HandlerRegistry } from './handlers.js';

const createBody = z.object({
  connector: z.string().min(1).max(64),
  action: z.string().min(1).max(64),
  target: z.object({
    system: z.string().min(1).max(64),
    type: z.string().max(64).optional(),
    id: z.string().max(200).optional(),
    version: z.string().max(200).optional(),
  }),
  summary: z.string().min(1).max(500),
  payload: z.unknown(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});

const decisionBody = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(1000).optional(),
});

const toolCallBody = z.object({
  ts: z.coerce.date().optional(),
  connector: z.string().min(1).max(64),
  tool: z.string().min(1).max(64),
  outcome: z.string().min(1).max(32),
  durationMs: z.number().int().nonnegative().max(3_600_000).optional(),
  summary: z.record(z.string(), z.unknown()).optional(),
});

const auditQuery = z.object({
  actor: z.string().optional(),
  connector: z.string().optional(),
  kind: z.enum(['tool_call', 'approval', 'model_call', 'admin']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(500),
  format: z.enum(['json', 'csv']).default('json'),
});

const listQuery = z.object({
  status: z.enum(['pending', 'approved', 'executing', 'executed', 'failed', 'rejected', 'expired', 'stale']).optional(),
  requester: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createApp(db: Db, handlers: HandlerRegistry, cfg: Config, now: () => Date = () => new Date()): Express {
  const approvals = new ApprovalService(db, handlers, {
    ttlHours: cfg.APPROVAL_TTL_HOURS,
    selfConfirmLimit: cfg.MVP_SELF_CONFIRM_LIMIT,
    now,
  });
  const secrets = { mcp: cfg.GOV_MCP_SECRET, dashboard: cfg.GOV_DASHBOARD_SECRET };
  const asMcp = requireService(['mcp'], secrets, cfg.adminEmails);
  const asDashboard = requireService(['dashboard'], secrets, cfg.adminEmails);
  const asEither = requireService(['mcp', 'dashboard'], secrets, cfg.adminEmails);
  const out = (row: Parameters<typeof present>[0]) => present(row, cfg.DASHBOARD_URL);
  const idParam = (req: Request) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) throw new HttpError(404, 'not_found', 'Request not found.');
    return id;
  };

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok', actions: handlers.list() });
  });

  // ---- approvals (FR-11)
  app.post('/v1/approvals', asMcp, async (req, res) => {
    const body = createBody.parse(req.body);
    const row = await approvals.create({ ...body, requesterEmail: req.actor!.email });
    res.status(201).json(out(row));
  });

  app.get('/v1/approvals', asEither, async (req, res) => {
    const q = listQuery.parse(req.query);
    const rows = await approvals.list(req.actor!, q);
    res.json({ items: rows.map(out) });
  });

  app.get('/v1/approvals/:id', asEither, async (req, res) => {
    res.json(out(await approvals.get(idParam(req), req.actor!)));
  });

  // Decisions come only from the dashboard (a human clicking Confirm), never from an MCP server / the model.
  app.post('/v1/approvals/:id/decision', asDashboard, async (req, res) => {
    const body = decisionBody.parse(req.body);
    res.json(out(await approvals.decide(idParam(req), req.actor!, body.decision, body.reason)));
  });

  // ---- audit (FR-12)
  app.post('/v1/audit/tool-calls', asMcp, async (req, res) => {
    const b = toolCallBody.parse(req.body);
    await recordAudit(db, {
      ts: b.ts ?? now(), kind: 'tool_call', actorEmail: req.actor!.email, connector: b.connector, tool: b.tool,
      outcome: b.outcome, durationMs: b.durationMs ?? null, details: b.summary ?? {},
    });
    res.status(202).json({ ok: true });
  });

  app.get('/v1/audit/events', asDashboard, requireAdmin, async (req, res) => {
    const q = auditQuery.parse(req.query);
    const rows = await queryAudit(db, q);
    if (q.format === 'csv') {
      res.type('text/csv').attachment('audit-events.csv').send(toCsv(rows));
      return;
    }
    res.json({ items: rows });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
  });

  // Errors: known errors keep their status and safe message; anything else is a generic 500 (no internals leaked).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
      return;
    }
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: 'bad_request', message: 'Invalid request.',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
      return;
    }
    if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'bad_json', message: 'Malformed JSON.' } });
      return;
    }
    process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), event: 'error', message: String(err) }) + '\n');
    res.status(500).json({ error: { code: 'internal', message: 'Internal error.' } });
  });

  return app;
}

export { ApprovalService };
