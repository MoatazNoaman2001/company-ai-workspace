import express, { type Express } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireCaller } from './auth.js';
import { buildServer } from './tools.js';
import type { FetchFn } from './drive.js';

export function createApp(serviceSecret: string, fetchFn: FetchFn = fetch): Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/mcp', express.json({ limit: '1mb' }), requireCaller(serviceSecret), async (req, res) => {
    // Stateless Streamable HTTP: a fresh server + transport per request, bound to this caller.
    const server = buildServer(req.caller!, fetchFn);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
      }
    }
  });

  // Stateless server: no SSE stream or session to resume or delete.
  app.all('/mcp', (_req, res) => {
    res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed' });
  });

  return app;
}
