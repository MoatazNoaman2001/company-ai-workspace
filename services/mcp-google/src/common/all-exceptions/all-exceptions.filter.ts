import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { HttpError } from '../http-error.js';

/** One error shape ({ error: { code, message } }); unexpected errors become a generic 500 with no internals. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err instanceof HttpException) {
      const status = err.getStatus();
      res.status(status).json({ error: { code: status === 404 ? 'not_found' : 'bad_request', message: status === 404 ? 'Not found.' : 'Invalid request.' } });
      return;
    }
    process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', event: 'unhandled', message: String(err) }) + '\n');
    res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
  }
}
