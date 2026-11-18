import { describe, expect, it, vi } from 'vitest';
import { buildSearchUrl, DriveClient, DriveError, escapeDriveQuery, readStrategy } from './drive.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('escapeDriveQuery', () => {
  it('escapes quotes and backslashes so user text cannot change the Drive query', () => {
    expect(escapeDriveQuery("it's")).toBe("it\\'s");
    expect(escapeDriveQuery('a\\b')).toBe('a\\\\b');
    expect(escapeDriveQuery("x' or name contains '")).toBe("x\\' or name contains \\'");
  });
});

describe('buildSearchUrl', () => {
  it('searches full text, excludes trash, includes shared drives and caps page size', () => {
    const url = new URL(buildSearchUrl("budget 2026's", 100));
    expect(url.searchParams.get('q')).toBe("fullText contains 'budget 2026\\'s' and trashed = false");
    expect(url.searchParams.get('pageSize')).toBe('25');
    expect(url.searchParams.get('includeItemsFromAllDrives')).toBe('true');
  });
});

describe('readStrategy', () => {
  it('exports Google formats and downloads text, rejects binaries', () => {
    expect(readStrategy('application/vnd.google-apps.document')).toEqual({ kind: 'export', as: 'text/plain' });
    expect(readStrategy('application/vnd.google-apps.spreadsheet')).toEqual({ kind: 'export', as: 'text/csv' });
    expect(readStrategy('text/markdown')).toEqual({ kind: 'download' });
    expect(readStrategy('application/pdf')).toEqual({ kind: 'unsupported' });
  });
});

describe('DriveClient', () => {
  it("sends the user's own token on every call", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ files: [] }));
    await new DriveClient('user-token', fetchFn).search('policy');
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer user-token');
  });

  it('gives the same answer for "missing" and "no permission" (never confirms a file exists)', async () => {
    for (const status of [403, 404]) {
      const client = new DriveClient('t', vi.fn().mockResolvedValue(jsonResponse({ error: {} }, status)));
      const err = await client.getMetadata('abc12345').catch((e) => e);
      expect(err).toBeInstanceOf(DriveError);
      expect(err.message).toBe('File not found, or you do not have access to it.');
    }
  });

  it('asks the user to reconnect on 401', async () => {
    const client = new DriveClient('expired', vi.fn().mockResolvedValue(jsonResponse({}, 401)));
    await expect(client.search('x')).rejects.toMatchObject({ kind: 'auth' });
  });

  it('exports a Google Doc as text and truncates', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'doc1', name: 'HR Policy', mimeType: 'application/vnd.google-apps.document' }))
      .mockResolvedValueOnce(new Response('a'.repeat(1000)));
    const { file, text, truncated } = await new DriveClient('t', fetchFn).readText('doc1', 600);
    expect(file.name).toBe('HR Policy');
    expect(fetchFn.mock.calls[1][0]).toContain('/files/doc1/export?mimeType=text%2Fplain');
    expect(text).toHaveLength(600);
    expect(truncated).toBe(true);
  });

  it('refuses binary files with a link instead of reading them', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse({ id: 'p1', name: 'scan.pdf', mimeType: 'application/pdf', webViewLink: 'https://drive/p1' }),
    );
    await expect(new DriveClient('t', fetchFn).readText('p1xxx', 1000)).rejects.toMatchObject({ kind: 'unsupported' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
