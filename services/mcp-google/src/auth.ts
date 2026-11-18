import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Request guard (FR-17 identity rules):
 * 1. Only LibreChat may call this server: it must send the shared service secret.
 * 2. Every call must carry the end user's Google access token (Bearer). Without it we answer 401,
 *    which makes LibreChat start the per-user Google OAuth flow.
 */

export interface CallerContext {
  accessToken: string;
  userEmail: string;
  userId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    caller?: CallerContext;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function requireCaller(serviceSecret: string) {
  if (!serviceSecret || serviceSecret.length < 32) {
    throw new Error('MCP_SERVICE_SECRET must be set (32+ characters)');
  }
  return (req: Request, res: Response, next: NextFunction): void => {
    const secret = req.header('x-service-secret') ?? '';
    if (!safeEqual(secret, serviceSecret)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const auth = req.header('authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(auth);
    if (!match) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="google-workspace"');
      res.status(401).json({ error: 'google_authorization_required' });
      return;
    }
    req.caller = {
      accessToken: match[1],
      userEmail: (req.header('x-user-email') ?? '').toLowerCase(),
      userId: req.header('x-user-id') ?? '',
    };
    next();
  };
}
