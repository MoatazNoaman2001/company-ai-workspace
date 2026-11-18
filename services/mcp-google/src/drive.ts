/**
 * Google Drive v3 client, called with the end user's own OAuth access token.
 * Every result is therefore limited to files that user can already open (FR-08).
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const REQUEST_TIMEOUT_MS = 30_000; // NFR: connector calls time out after 30 seconds

export type FetchFn = typeof fetch;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  size?: string;
  owners?: { displayName?: string }[];
}

/** Error shown to the model and user. Never contains tokens or raw Google responses. */
export class DriveError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'not_found' | 'rate_limited' | 'unsupported' | 'upstream',
  ) {
    super(message);
  }
}

/** Escapes a value for a Drive `q` string literal (backslash and single quote). */
export function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function buildSearchUrl(query: string, maxResults: number): string {
  const q = `fullText contains '${escapeDriveQuery(query.trim())}' and trashed = false`;
  const params = new URLSearchParams({
    q,
    pageSize: String(Math.min(Math.max(maxResults, 1), 25)),
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName))',
    orderBy: 'modifiedTime desc',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  return `${DRIVE_API}/files?${params}`;
}

/** Google-native types are exported to text; plain text types are downloaded as is. */
export function readStrategy(mimeType: string): { kind: 'export'; as: string } | { kind: 'download' } | { kind: 'unsupported' } {
  switch (mimeType) {
    case 'application/vnd.google-apps.document':
      return { kind: 'export', as: 'text/plain' };
    case 'application/vnd.google-apps.spreadsheet':
      return { kind: 'export', as: 'text/csv' };
    case 'application/vnd.google-apps.presentation':
      return { kind: 'export', as: 'text/plain' };
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/csv') {
    return { kind: 'download' };
  }
  return { kind: 'unsupported' };
}

export class DriveClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  private async request(url: string): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new DriveError(timedOut ? 'Google Drive did not answer within 30 seconds.' : 'Could not reach Google Drive.', 'upstream');
    }
    if (res.ok) return res;
    switch (res.status) {
      case 401:
        throw new DriveError('Your Google connection has expired. Reconnect Google Workspace and try again.', 'auth');
      case 403:
      case 404:
        // Same message for "missing" and "no permission": never reveal that a file exists.
        throw new DriveError('File not found, or you do not have access to it.', 'not_found');
      case 429:
        throw new DriveError('Google Drive rate limit reached. Try again in a minute.', 'rate_limited');
      default:
        throw new DriveError(`Google Drive returned an error (${res.status}).`, 'upstream');
    }
  }

  async search(query: string, maxResults = 10): Promise<DriveFile[]> {
    const res = await this.request(buildSearchUrl(query, maxResults));
    const body = (await res.json()) as { files?: DriveFile[] };
    return body.files ?? [];
  }

  async getMetadata(fileId: string): Promise<DriveFile> {
    const params = new URLSearchParams({
      fields: 'id,name,mimeType,modifiedTime,webViewLink,size',
      supportsAllDrives: 'true',
    });
    const res = await this.request(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?${params}`);
    return (await res.json()) as DriveFile;
  }

  async readText(fileId: string, maxChars: number): Promise<{ file: DriveFile; text: string; truncated: boolean }> {
    const file = await this.getMetadata(fileId);
    const strategy = readStrategy(file.mimeType);
    if (strategy.kind === 'unsupported') {
      throw new DriveError(
        `"${file.name}" is a ${file.mimeType} file; only Google Docs, Sheets, Slides and text files can be read. Open it here: ${file.webViewLink ?? 'n/a'}`,
        'unsupported',
      );
    }
    const id = encodeURIComponent(fileId);
    const url =
      strategy.kind === 'export'
        ? `${DRIVE_API}/files/${id}/export?${new URLSearchParams({ mimeType: strategy.as })}`
        : `${DRIVE_API}/files/${id}?${new URLSearchParams({ alt: 'media', supportsAllDrives: 'true' })}`;
    const text = await (await this.request(url)).text();
    const truncated = text.length > maxChars;
    return { file, text: truncated ? text.slice(0, maxChars) : text, truncated };
  }
}
