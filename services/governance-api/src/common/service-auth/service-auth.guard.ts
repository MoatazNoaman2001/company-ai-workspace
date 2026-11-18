import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Config } from '../../core/config.js';
import { HttpError } from '../../core/errors.js';
import { APP_CONFIG } from '../../core/tokens.js';
import { ADMIN_ONLY_KEY, CALLERS_KEY, type Actor, type ServiceName } from './callers.decorator.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Only our own services call governance-api, each with its own secret:
 *   X-Service-Name: mcp | dashboard, X-Service-Secret: <secret>, X-Actor-Email: <end user>.
 * The MCP server gets the user from LibreChat; the dashboard from its own SSO session.
 * Browsers and models never call governance-api directly.
 */
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly cfg: Config,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const allowed = this.reflector.getAllAndOverride<ServiceName[] | undefined>(CALLERS_KEY, targets);
    if (!allowed) return true;

    const req = ctx.switchToHttp().getRequest<Request & { service?: ServiceName; actor?: Actor }>();
    const secrets: Record<ServiceName, string> = { mcp: this.cfg.GOV_MCP_SECRET, dashboard: this.cfg.GOV_DASHBOARD_SECRET };
    const name = req.header('x-service-name') as ServiceName | undefined;
    const secret = req.header('x-service-secret') ?? '';
    if (!name || !(name in secrets) || !safeEqual(secret, secrets[name]) || !allowed.includes(name)) {
      throw new HttpError(403, 'forbidden', 'Forbidden.');
    }
    const email = (req.header('x-actor-email') ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw new HttpError(400, 'actor_required', 'X-Actor-Email is required.');
    req.service = name;
    req.actor = { email, isAdmin: this.cfg.adminEmails.has(email) };

    if (this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY_KEY, targets) && !req.actor.isAdmin) {
      throw new HttpError(403, 'admin_only', 'Admin only.');
    }
    return true;
  }
}
