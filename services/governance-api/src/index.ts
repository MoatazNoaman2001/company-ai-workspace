import { createApp } from './app.js';
import { ApprovalService } from './approvals.js';
import { loadConfig } from './config.js';
import { createPgDb } from './db.js';
import { HandlerRegistry } from './handlers.js';
import { migrate } from './migrations.js';

const log = (event: string, extra: Record<string, unknown> = {}) =>
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), event, ...extra }) + '\n');

const cfg = loadConfig();
const db = createPgDb(cfg.DATABASE_URL);
const applied = await migrate(db);
log('migrated', { applied });

// Action handlers (connector write actions) are registered here as connectors arrive (ERPNext next).
const handlers = new HandlerRegistry();

const app = createApp(db, handlers, cfg);
const server = app.listen(cfg.PORT, () => log('started', { port: cfg.PORT, actions: handlers.list() }));

// FR-11: pending requests expire after APPROVAL_TTL_HOURS even if nobody looks at them.
const sweeper = new ApprovalService(db, handlers, {
  ttlHours: cfg.APPROVAL_TTL_HOURS, selfConfirmLimit: cfg.MVP_SELF_CONFIRM_LIMIT, now: () => new Date(),
});
const timer = setInterval(() => {
  sweeper.sweepExpired().then((n) => n && log('expired_swept', { count: n })).catch((e) => log('sweep_error', { message: String(e) }));
}, 5 * 60_000);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => void db.close().then(() => process.exit(0)));
  });
}
