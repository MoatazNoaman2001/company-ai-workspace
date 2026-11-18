import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Callers, CurrentActor, type Actor } from '../common/service-auth/callers.decorator.js';
import type { Config } from '../core/config.js';
import { HttpError } from '../core/errors.js';
import { APP_CONFIG } from '../core/tokens.js';
import { ApprovalsService, present } from './approvals.service.js';

const createBody = z.object({
  connector: z.string().min(1).max(64),
  action: z.string().min(1).max(64),
  target: z.object({
    system: z.string().min(1).max(64),
    type: z.string().max(64).optional(),
    id: z.string().max(200).optional(),
    version: z.string().max(200).optional(),
  }),
  summary: z.string().min(1).max(500),
  payload: z.unknown(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});

const decisionBody = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(1000).optional(),
});

const listQuery = z.object({
  status: z.enum(['pending', 'approved', 'executing', 'executed', 'failed', 'rejected', 'expired', 'stale']).optional(),
  requester: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const checkId = (id: string) => {
  if (!UUID.test(id)) throw new HttpError(404, 'not_found', 'Request not found.');
  return id;
};

/** FR-11 approval queue. */
@Controller('v1/approvals')
export class ApprovalsController {
  constructor(
    @Inject(ApprovalsService) private readonly approvals: ApprovalsService,
    @Inject(APP_CONFIG) private readonly cfg: Config,
  ) {}

  private out(row: Parameters<typeof present>[0]) {
    return present(row, this.cfg.DASHBOARD_URL);
  }

  /** A connector's write tool asks for approval instead of writing (BRD rule 6). */
  @Post()
  @Callers('mcp')
  async create(@Body() body: unknown, @CurrentActor() actor: Actor) {
    const b = createBody.parse(body);
    return this.out(await this.approvals.create({ ...b, requesterEmail: actor.email }));
  }

  @Get()
  @Callers('mcp', 'dashboard')
  async list(@Query() query: unknown, @CurrentActor() actor: Actor) {
    const rows = await this.approvals.list(actor, listQuery.parse(query));
    return { items: rows.map((r) => this.out(r)) };
  }

  @Get(':id')
  @Callers('mcp', 'dashboard')
  async get(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.out(await this.approvals.get(checkId(id), actor));
  }

  /** Decisions come only from the dashboard (a human clicking Confirm), never from an MCP server or the model. */
  @Post(':id/decision')
  @HttpCode(200)
  @Callers('dashboard')
  async decide(@Param('id') id: string, @Body() body: unknown, @CurrentActor() actor: Actor) {
    const b = decisionBody.parse(body);
    return this.out(await this.approvals.decide(checkId(id), actor, b.decision, b.reason));
  }
}

