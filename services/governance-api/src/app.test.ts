import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createTestDb } from '../test/pglite.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { PolicyRefusal } from './errors.js';
import { HandlerRegistry, type ActionHandler } from './handlers.js';
import { migrate } from './migrations.js';

const MCP = 'm'.repeat(40);
const DASH = 'd'.repeat(40);
const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';
const ADMIN = 'admin@example.com';

let clock = new Date('2026-11-18T10:00:00Z');
const execute = vi.fn();
let currentVersion: string | null = 'v1';

// A fake connector action: quotation with an amount; owner rule like the ERPNext update tool.
const handler: ActionHandler = {
  connector: 'erpnext',
  action: 'create_quotation',
  payloadSchema: z.object({ customer: z.string(), amount: z.number().positive(), owner: z.string().optional() }),
  async assessRisk(p, ctx) {
    const payload = p as { amount: number; owner?: string };
    if (payload.owner && payload.owner !== ctx.requesterEmail) throw new PolicyRefusal('You can only change your own drafts.');
    return payload.amount > ctx.selfConfirmLimit ? 'medium' : 'low';
  },
  async currentVersion() {
    return currentVersion;
  },
  execute: (row) => execute(row),
};

let db: Awaited<ReturnType<typeof createTestDb>>;
let server: Server;
let base: string;

beforeAll(async () => {
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  db = await createTestDb();
  await migrate(db);
  const cfg = loadConfig({
    DATABASE_URL: 'unused', GOV_MCP_SECRET: MCP, GOV_DASHBOARD_SECRET: DASH, MVP_SELF_CONFIRM_LIMIT: '50000',
    APPROVAL_TTL_HOURS: '24', ADMIN_EMAILS: ADMIN, DASHBOARD_URL: 'https://dash.example',
  });
  server = createApp(db, new HandlerRegistry().register(handler), cfg, () => clock).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await db.close();
});
beforeEach(() => {
  clock = new Date('2026-11-18T10:00:00Z');
  currentVersion = 'v1';
  execute.mockReset().mockResolvedValue({ quotation: 'QTN-0001' });
});

function call(method: string, path: string, opts: { as?: 'mcp' | 'dashboard'; actor?: string; body?: unknown; secret?: string } = {}) {
  const as = opts.as ?? 'dashboard';
  return fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-service-name': as,
      'x-service-secret': opts.secret ?? (as === 'mcp' ? MCP : DASH),
      'x-actor-email': opts.actor ?? ALICE,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

async function createRequest(amount = 12_000, extra: Record<string, unknown> = {}) {
  const res = await call('POST', '/v1/approvals', {
    as: 'mcp', actor: ALICE,
    body: { connector: 'erpnext', action: 'create_quotation', target: { system: 'erpnext', type: 'Quotation', id: 'Q-1', version: 'v1' },
      summary: `Quotation for ACME, ${amount} EGP`, payload: { customer: 'ACME', amount, ...extra },
      before: null, after: { amount } },
  });
  return { res, body: await res.json() };
}

const auditOutcomes = async (id: string) =>
  (await db.query<{ outcome: string }>('SELECT outcome FROM audit_events WHERE request_id = $1 ORDER BY id', [id])).rows.map((r) => r.outcome);

describe('callers', () => {
  it('rejects a wrong service secret', async () => {
    expect((await call('GET', '/v1/approvals', { secret: 'x'.repeat(40) })).status).toBe(403);
  });
  it('MCP servers cannot record decisions (only a human via the dashboard can)', async () => {
    const { body } = await createRequest();
    const res = await call('POST', `/v1/approvals/${body.id}/decision`, { as: 'mcp', body: { decision: 'approve' } });
    expect(res.status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
  it('requires an actor', async () => {
    expect((await call('GET', '/v1/approvals', { actor: 'not-an-email' })).status).toBe(400);
  });
});

describe('creating requests', () => {
  it('creates a pending low-risk request with a confirm link and an audit entry, and does not execute', async () => {
    const { res, body } = await createRequest();
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ status: 'pending', riskLevel: 'low', requester: ALICE });
    expect(body.confirmUrl).toBe(`https://dash.example/actions/${body.id}`);
    expect(new Date(body.expiresAt).getTime() - clock.getTime()).toBe(24 * 3600_000);
    expect(execute).not.toHaveBeenCalled();
    expect(await auditOutcomes(body.id)).toEqual(['requested']);
  });
  it('refuses amounts above the self-confirm limit in the MVP', async () => {
    const { res, body } = await createRequest(80_000);
    expect(res.status).toBe(422);
    expect(body.error.code).toBe('policy_refused');
  });
  it('refuses changes to records the requester does not own', async () => {
    const { res, body } = await createRequest(1000, { owner: BOB });
    expect(res.status).toBe(422);
    expect(body.error.message).toMatch(/own drafts/);
  });
  it('refuses unknown actions and invalid payloads', async () => {
    const r1 = await call('POST', '/v1/approvals', { as: 'mcp', body: { connector: 'gmail', action: 'send', target: { system: 'gmail' }, summary: 's', payload: {} } });
    expect((await r1.json()).error.code).toBe('unknown_action');
    const r2 = await call('POST', '/v1/approvals', { as: 'mcp', body: { connector: 'erpnext', action: 'create_quotation', target: { system: 'erpnext' }, summary: 's', payload: { customer: 'A', amount: -5 } } });
    expect((await r2.json()).error.code).toBe('invalid_payload');
  });
});

describe('deciding', () => {
  it('the requester confirms: executes exactly once and records the result', async () => {
    const { body } = await createRequest();
    const res = await call('POST', `/v1/approvals/${body.id}/decision`, { body: { decision: 'approve' } });
    const done = await res.json();
    expect(res.status).toBe(200);
    expect(done).toMatchObject({ status: 'executed', decidedBy: ALICE, result: { quotation: 'QTN-0001' } });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await auditOutcomes(body.id)).toEqual(['requested', 'approved', 'executed']);
    const step = await db.query('SELECT approver_role, decision FROM approval_steps WHERE request_id = $1', [body.id]);
    expect(step.rows).toEqual([{ approver_role: 'requester', decision: 'approve' }]);
  });
  it('a second confirm does not execute again', async () => {
    const { body } = await createRequest();
    await call('POST', `/v1/approvals/${body.id}/decision`, { body: { decision: 'approve' } });
    const again = await call('POST', `/v1/approvals/${body.id}/decision`, { body: { decision: 'approve' } });
    expect(again.status).toBe(409);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('concurrent confirms execute once', async () => {
    const { body } = await createRequest();
    const results = await Promise.all([1, 2, 3].map(() => call('POST', `/v1/approvals/${body.id}/decision`, { body: { decision: 'approve' } })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('someone else cannot confirm, and cannot even see the request', async () => {
    const { body } = await createRequest();
    const res = await call('POST', `/v1/approvals/${body.id}/decision`, { actor: BOB, body: { decision: 'approve' } });
    expect(res.status).toBe(404);
    expect(execute).not.toHaveBeenCalled();
  });
  it('rejection needs a reason and never executes', async () => {
    const { body } = await createRequest();
    expect((await call('POST', `/v1/approvals/${body.id}/decision`, { body: { decision: 'reject' } })).status).toBe(400);
    const res = await call('POST', `/v1/approvals/${body.id}/decision`, { body: { decision: 'reject', reason: 'wrong customer' } });
    expect((await res.json()).status).toBe('rejected');
    expect((await call('POST', `/v1/approvals/${body.id}/decision`, { body: { decision: 'approve' } })).status).toBe(409);
    expect(execute).not.toHaveBeenCalled();
  });
  it('an admin may reject but not confirm someone else\'s request', async () => {
    const { body } = await createRequest();
    expect((await call('POST', `/v1/approvals/${body.id}/decision`, { actor: ADMIN, body: { decision: 'approve' } })).status).toBe(403);
    const res = await call('POST', `/v1/approvals/${body.id}/decision`, { actor: ADMIN, body: { decision: 'reject', reason: 'policy' } });
    expect((await res.json()).status).toBe('rejected');
  });
  it('expired requests cannot be confirmed', async () => {
    const { body } = await createRequest();
    clock = new Date(clock.getTime() + 25 * 3600_000);
    const res = await call('POST', `/v1/approvals/${body.id}/decision`, { body: { decision: 'approve' } });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('expired');
    const view = await (await call('GET', `/v1/approvals/${body.id}`)).json();
    expect(view.status).toBe('expired');
    expect(execute).not.toHaveBeenCalled();
  });
  it('stale requests (record changed) cannot be confirmed', async () => {
    const { body } = await createRequest();
    currentVersion = 'v2';
    const res = await call('POST', `/v1/approvals/${body.id}/decision`, { body: { decision: 'approve' } });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('stale');
    expect((await (await call('GET', `/v1/approvals/${body.id}`)).json()).status).toBe('stale');
    expect(execute).not.toHaveBeenCalled();
  });
  it('a failing target system is recorded as failed without leaking internals', async () => {
    execute.mockRejectedValueOnce(new Error('ECONNREFUSED 10.0.0.5:8000 password=hunter2'));
    const { body } = await createRequest();
    const res = await call('POST', `/v1/approvals/${body.id}/decision`, { body: { decision: 'approve' } });
    expect(res.status).toBe(502);
    const view = await (await call('GET', `/v1/approvals/${body.id}`)).json();
    expect(view.status).toBe('failed');
    expect(JSON.stringify(view)).not.toMatch(/hunter2|10\.0\.0\.5/);
  });
});

describe('listing', () => {
  it('users see only their own requests; admins can see everyone', async () => {
    await createRequest();
    const mine = await (await call('GET', '/v1/approvals', { actor: BOB })).json();
    expect(mine.items.every((i: { requester: string }) => i.requester === BOB)).toBe(true);
    const all = await (await call('GET', '/v1/approvals', { actor: ADMIN })).json();
    expect(all.items.some((i: { requester: string }) => i.requester === ALICE)).toBe(true);
  });
});

describe('audit log', () => {
  it('accepts tool-call events from connectors and exports CSV to admins only', async () => {
    const r = await call('POST', '/v1/audit/tool-calls', { as: 'mcp', actor: ALICE,
      body: { connector: 'google-workspace', tool: 'drive_search', outcome: '=cmd|calc', durationMs: 120, summary: { results: 3 } } });
    expect(r.status).toBe(202);
    expect((await call('GET', '/v1/audit/events', { actor: ALICE })).status).toBe(403);
    const csv = await (await call('GET', '/v1/audit/events?format=csv&kind=tool_call', { actor: ADMIN })).text();
    expect(csv.split('\n')[0]).toContain('actor_email');
    expect(csv).toContain("'=cmd|calc"); // formula neutralised
    expect(csv).toContain(ALICE);
  });
  it('is append-only, even for the database owner', async () => {
    await expect(db.query("UPDATE audit_events SET outcome = 'tampered'")).rejects.toThrow(/append-only/);
    await expect(db.query('DELETE FROM audit_events')).rejects.toThrow(/append-only/);
  });
  it('migrations are idempotent', async () => {
    expect(await migrate(db)).toEqual([]);
  });
});
