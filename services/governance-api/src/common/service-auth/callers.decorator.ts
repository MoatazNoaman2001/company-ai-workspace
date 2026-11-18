import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export type ServiceName = 'mcp' | 'dashboard';

export interface Actor {
  email: string;
  isAdmin: boolean;
}

export const CALLERS_KEY = 'callers';
export const ADMIN_ONLY_KEY = 'adminOnly';

/** Which of our services may call this route. Routes without it are public (only /health). */
export const Callers = (...names: ServiceName[]) => SetMetadata(CALLERS_KEY, names);

/** Route is limited to admins (on top of @Callers). */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY_KEY, true);

/** The end user on whose behalf the calling service acts (set by ServiceAuthGuard). */
export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  return ctx.switchToHttp().getRequest<Request & { actor: Actor }>().actor;
});
