import { timingSafeEqual } from 'node:crypto';
import {
  createParamDecorator,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { APP_CONFIG, type Config } from '../../config/config.module.js';
import { HttpError } from '../http-error.js';

export interface CallerContext {
  accessToken: string;
  userEmail: string;
  userId: string;
}

/** The end user (and their Google token) for this MCP request, set by CallerGuard. */
export const Caller = createParamDecorator((_: unknown, ctx: ExecutionContext): CallerContext => {
  return ctx.switchToHttp().getRequest<Request & { caller: CallerContext }>().caller;
});

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * FR-17 identity rules for every MCP call:
 * 1. Only LibreChat may call this server: it must send the shared service secret (403 otherwise).
 * 2. The call must carry the end user's Google access token (Bearer). Without it we answer 401 with
 *    WWW-Authenticate, which makes LibreChat start the per-user Google OAuth flow.
 */
@Injectable()
export class CallerGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly cfg: Config) {}

  canActivate(ctx: ExecutionContext): boolean {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request & { caller?: CallerContext }>();
    if (!safeEqual(req.header('x-service-secret') ?? '', this.cfg.MCP_SERVICE_SECRET)) {
      throw new HttpError(403, 'forbidden', 'Forbidden.');
    }
    const match = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '');
    if (!match) {
      http.getResponse<Response>().setHeader('WWW-Authenticate', 'Bearer realm="google-workspace"');
      throw new HttpError(401, 'google_authorization_required', 'Google authorization required.');
    }
    req.caller = {
      accessToken: match[1],
      userEmail: (req.header('x-user-email') ?? '').toLowerCase(),
      userId: req.header('x-user-id') ?? '',
    };
    return true;
  }
}
