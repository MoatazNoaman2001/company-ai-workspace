import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../../core/errors.js';

/**
 * One error shape for every failure: { error: { code, message, ... } }.
 * Known errors keep their status and safe message; anything unexpected is a generic 500 (no internals leaked).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({
        error: { code: 'bad_request', message: 'Invalid request.',
          issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      });
      return;
    }
    if (err instanceof HttpException) {
      // Nest's own errors: unknown route (404), malformed JSON body (400), ...
      const status = err.getStatus();
      res.status(status).json({ error: { code: status === 404 ? 'not_found' : 'bad_request', message: status === 404 ? 'Not found.' : 'Invalid request.' } });
      return;
    }
    process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', event: 'unhandled', message: String(err) }) + '\n');
    res.status(500).json({ error: { code: 'internal', message: 'Internal error.' } });
  }
}
