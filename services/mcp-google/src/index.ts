import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8080);
const app = createApp(process.env.MCP_SERVICE_SECRET ?? '');

const server = app.listen(port, () => {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), event: 'started', port }) + '\n');
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
