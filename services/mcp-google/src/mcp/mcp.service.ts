import { Inject, Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { CallerContext } from '../common/caller/caller.guard.js';
import { DriveError, type DriveFile } from '../drive/drive.client.js';
import { DriveService } from '../drive/drive.module.js';

const DEFAULT_MAX_CHARS = 20_000;

function formatFile(f: DriveFile): string {
  const owner = f.owners?.[0]?.displayName;
  return [
    `- ${f.name}`,
    `  id: ${f.id}`,
    `  type: ${f.mimeType}`,
    f.modifiedTime ? `  modified: ${f.modifiedTime}` : null,
    owner ? `  owner: ${owner}` : null,
    f.webViewLink ? `  link: ${f.webViewLink}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function errorResult(err: unknown) {
  const text = err instanceof DriveError ? err.message : 'Unexpected error while calling Google Drive.';
  return { isError: true, content: [{ type: 'text' as const, text }] };
}

/** Builds one MCP server per request (stateless), with the read-only Drive tools bound to the caller's token. */
@Injectable()
export class McpService {
  constructor(
    @Inject(DriveService) private readonly drive: DriveService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  buildServer(caller: CallerContext): McpServer {
    const server = new McpServer({ name: 'google-workspace', version: '0.2.0' });
    const drive = this.drive.forUser(caller.accessToken);
    const audit = this.audit;

    server.registerTool(
      'drive_search',
      {
        title: 'Search Google Drive',
        description:
          "Full-text search of the user's Google Drive, including shared drives. Returns only files the user can open. Use drive_read_file to read a result.",
        inputSchema: {
          query: z.string().min(1).max(200).describe('Words to search for in file names and contents'),
          maxResults: z.number().int().min(1).max(25).default(10).describe('Maximum number of files (1-25)'),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ query, maxResults }) => {
        const started = Date.now();
        try {
          const files = await drive.search(query, maxResults);
          audit.toolCall(caller, 'drive_search', { queryLength: query.length, results: files.length }, started, 'ok');
          const text = files.length
            ? `Found ${files.length} file(s) for "${query}":\n${files.map(formatFile).join('\n')}`
            : `No files found for "${query}" that you have access to.`;
          return { content: [{ type: 'text' as const, text }] };
        } catch (err) {
          audit.toolCall(caller, 'drive_search', { queryLength: query.length }, started, err instanceof DriveError ? err.kind : 'error');
          return errorResult(err);
        }
      },
    );

    server.registerTool(
      'drive_read_file',
      {
        title: 'Read a Google Drive file',
        description:
          'Reads the text of one Drive file by id (Google Docs, Sheets as CSV, Slides, plain text, Markdown, CSV). Cite the file name and link in the answer.',
        inputSchema: {
          fileId: z.string().min(5).max(200).regex(/^[\w-]+$/).describe('File id from drive_search'),
          maxChars: z.number().int().min(500).max(100_000).default(DEFAULT_MAX_CHARS).describe('Maximum characters to return'),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ fileId, maxChars }) => {
        const started = Date.now();
        try {
          const { file, text, truncated } = await drive.readText(fileId, maxChars);
          audit.toolCall(caller, 'drive_read_file', { fileId, chars: text.length, truncated }, started, 'ok');
          const header = `File: ${file.name}\nLink: ${file.webViewLink ?? 'n/a'}\nModified: ${file.modifiedTime ?? 'n/a'}${truncated ? `\n(Truncated to ${maxChars} characters)` : ''}\n---\n`;
          return { content: [{ type: 'text' as const, text: header + text }] };
        } catch (err) {
          audit.toolCall(caller, 'drive_read_file', { fileId }, started, err instanceof DriveError ? err.kind : 'error');
          return errorResult(err);
        }
      },
    );

    return server;
  }
}
