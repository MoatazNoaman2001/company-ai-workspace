import type { z } from 'zod';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ApprovalRow {
  id: string;
  created_at: Date;
  expires_at: Date;
  status: string;
  risk_level: RiskLevel;
  required_approvals: number;
  connector: string;
  action: string;
  requester_email: string;
  department: string | null;
  target_system: string;
  target_type: string | null;
  target_id: string | null;
  target_version: string | null;
  summary: string;
  payload: unknown;
  before_state: unknown;
  after_state: unknown;
  decided_at: Date | null;
  decided_by: string | null;
  decision_reason: string | null;
  executed_at: Date | null;
  result: unknown;
  error: string | null;
}

export interface RiskContext {
  requesterEmail: string;
  selfConfirmLimit: number;
  targetId: string | null;
}

/**
 * One write action a connector may request (e.g. erpnext/create_quotation).
 * The governance-api, not the connector, executes it, and only after a recorded approval (BRD rule 6).
 */
export interface ActionHandler {
  connector: string;
  action: string;
  payloadSchema: z.ZodType;
  /** Classify the request. Throw PolicyRefusal to refuse it outright (e.g. not the owner of the record). */
  assessRisk(payload: unknown, ctx: RiskContext): Promise<RiskLevel>;
  /** Freshness check: the target's current version, compared with `target_version` at confirm time. */
  currentVersion?(row: ApprovalRow): Promise<string | null>;
  /** Perform the action as the requester. Returns a small, non-secret result (ids, links). */
  execute(row: ApprovalRow): Promise<Record<string, unknown>>;
}

export class HandlerRegistry {
  private readonly handlers = new Map<string, ActionHandler>();

  register(h: ActionHandler): this {
    this.handlers.set(`${h.connector}/${h.action}`, h);
    return this;
  }

  get(connector: string, action: string): ActionHandler | undefined {
    return this.handlers.get(`${connector}/${action}`);
  }

  list(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
