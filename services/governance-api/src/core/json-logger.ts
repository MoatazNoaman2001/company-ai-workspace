import type { LoggerService } from '@nestjs/common';

/** One JSON object per line, so logs can be grepped and shipped as-is. */
export class JsonLogger implements LoggerService {
  private write(level: string, message: unknown, context?: unknown) {
    const body = typeof message === 'object' && message !== null ? message : { message: String(message) };
    const line = JSON.stringify({ ts: new Date().toISOString(), level, ...(context ? { context } : {}), ...body });
    (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
  }
  log(message: unknown, context?: unknown) {
    this.write('info', message, context);
  }
  error(message: unknown, _trace?: unknown, context?: unknown) {
    this.write('error', message, context);
  }
  warn(message: unknown, context?: unknown) {
    this.write('warn', message, context);
  }
}
