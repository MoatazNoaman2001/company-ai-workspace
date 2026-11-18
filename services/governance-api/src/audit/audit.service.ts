import { Inject, Injectable } from '@nestjs/common';
import type { Db } from '../core/db.js';
import { CLOCK, DB, type Clock } from '../core/tokens.js';
import { queryAudit, recordAudit, toCsv, type AuditFilter, type AuditRow } from './audit.store.js';

export interface ToolCallEvent {
  actorEmail: string;
  ts?: Date;
  connector: string;
  tool: string;
  outcome: string;
  durationMs?: number;
  summary?: Record<string, unknown>;
}

/** FR-12 audit log. Approval events are written by ApprovalsService in the same transaction as the change. */
@Injectable()
export class AuditService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  recordToolCall(e: ToolCallEvent): Promise<void> {
    return recordAudit(this.db, {
      ts: e.ts ?? this.now(), kind: 'tool_call', actorEmail: e.actorEmail, connector: e.connector, tool: e.tool,
      outcome: e.outcome, durationMs: e.durationMs ?? null, details: e.summary ?? {},
    });
  }

  query(filter: AuditFilter): Promise<AuditRow[]> {
    return queryAudit(this.db, filter);
  }

  toCsv(rows: AuditRow[]): string {
    return toCsv(rows);
  }
}
