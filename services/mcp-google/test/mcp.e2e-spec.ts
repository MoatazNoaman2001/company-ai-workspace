import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { APP_CONFIG, loadConfig } from '../src/config/config.module.js';
import { DRIVE_FETCH } from '../src/drive/drive.module.js';

const SECRET = 's'.repeat(40);
const driveFetch = vi.fn();
let app: INestApplication;
let base: string;

beforeAll(async () => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true); // keep test output clean
  // The real AppModule (guard, filter, controller, services) with Google's API replaced by a mock.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG).useValue(loadConfig({ MCP_SERVICE_SECRET: SECRET }))
    .overrideProvider(DRIVE_FETCH).useValue(driveFetch)
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
});
afterAll(() => app.close());

function rpc(method: string, params: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'x-service-secret': SECRET,
      authorization: 'Bearer google-user-token',
      'x-user-email': 'Staff@Example.com',
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

describe('request guard', () => {
  it('rejects callers without the service secret (403)', async () => {
    const res = await rpc('tools/list', {}, { 'x-service-secret': 'wrong' });
    expect(res.status).toBe(403);
  });

  it('answers 401 with WWW-Authenticate when the user token is missing, so LibreChat starts OAuth', async () => {
    const res = await rpc('tools/list', {}, { authorization: '' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer/);
  });

  it('refuses to start without a strong secret', () => {
    expect(() => loadConfig({ MCP_SERVICE_SECRET: 'short' })).toThrow(/MCP_SERVICE_SECRET/);
  });
});

describe('MCP over HTTP', () => {
  it('lists exactly the read-only tools', async () => {
    const body = await (await rpc('tools/list', {})).json();
    const tools = body.result.tools;
    expect(tools.map((t: { name: string }) => t.name).sort()).toEqual(['drive_read_file', 'drive_search']);
    for (const t of tools) expect(t.annotations.readOnlyHint).toBe(true);
  });

  it('runs drive_search with the caller token and returns results', async () => {
    driveFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ files: [{ id: 'f1', name: 'Leave policy', mimeType: 'application/vnd.google-apps.document' }] })),
    );
    const body = await (await rpc('tools/call', { name: 'drive_search', arguments: { query: 'leave' } })).json();
    expect(body.result.content[0].text).toContain('Leave policy');
    expect(driveFetch.mock.calls.at(-1)![1].headers.Authorization).toBe('Bearer google-user-token');
  });

  it('returns a tool error (not a crash) when Drive denies access', async () => {
    driveFetch.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    const body = await (await rpc('tools/call', { name: 'drive_read_file', arguments: { fileId: 'secret-file' } })).json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toBe('File not found, or you do not have access to it.');
  });

  it('rejects GET (stateless server)', async () => {
    const res = await fetch(`${base}/mcp`);
    expect(res.status).toBe(405);
  });
});
