import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Actor } from './approvals.js';

export type ServiceName = 'mcp' | 'dashboard';

declare module 'express-serve-static-core' {
  interface Request {
    service?: ServiceName;
    actor?: Actor;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Only our own services call governance-api, each with its own secret:
 *   X-Service-Name: mcp | dashboard, X-Service-Secret: <secret>
 * They pass the end user as X-Actor-Email (the MCP server gets it from LibreChat, the dashboard from its
 * own SSO session). Browsers never call governance-api directly.
 */
export function requireService(allowed: ServiceName[], secrets: Record<ServiceName, string>, adminEmails: Set<string>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const name = req.header('x-service-name') as ServiceName | undefined;
    const secret = req.header('x-service-secret') ?? '';
    if (!name || !(name in secrets) || !safeEqual(secret, secrets[name]) || !allowed.includes(name)) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Forbidden.' } });
      return;
    }
    const email = (req.header('x-actor-email') ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) {
      res.status(400).json({ error: { code: 'actor_required', message: 'X-Actor-Email is required.' } });
      return;
    }
    req.service = name;
    req.actor = { email, isAdmin: adminEmails.has(email) };
    next();
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.actor?.isAdmin) {
    res.status(403).json({ error: { code: 'admin_only', message: 'Admin only.' } });
    return;
  }
  next();
}
