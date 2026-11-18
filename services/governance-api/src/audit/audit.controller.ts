import { Body, Controller, Get, HttpCode, Inject, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AdminOnly, Callers, CurrentActor, type Actor } from '../common/service-auth/callers.decorator.js';
import { AuditService } from './audit.service.js';

const toolCallBody = z.object({
  ts: z.coerce.date().optional(),
  connector: z.string().min(1).max(64),
  tool: z.string().min(1).max(64),
  outcome: z.string().min(1).max(32),
  durationMs: z.number().int().nonnegative().max(3_600_000).optional(),
  summary: z.record(z.string(), z.unknown()).optional(),
});

const eventsQuery = z.object({
  actor: z.string().optional(),
  connector: z.string().optional(),
  kind: z.enum(['tool_call', 'approval', 'model_call', 'admin']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(500),
  format: z.enum(['json', 'csv']).default('json'),
});

/** FR-12 audit log: connectors report tool calls; admins search and export. */
@Controller('v1/audit')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Post('tool-calls')
  @HttpCode(202)
  @Callers('mcp')
  async toolCall(@Body() body: unknown, @CurrentActor() actor: Actor) {
    await this.audit.recordToolCall({ ...toolCallBody.parse(body), actorEmail: actor.email });
    return { ok: true };
  }

  @Get('events')
  @Callers('dashboard')
  @AdminOnly()
  async events(@Query() query: unknown, @Res({ passthrough: true }) res: Response) {
    const q = eventsQuery.parse(query);
    const rows = await this.audit.query(q);
    if (q.format === 'csv') {
      res.type('text/csv').attachment('audit-events.csv');
      return this.audit.toCsv(rows);
    }
    return { items: rows };
  }
}
