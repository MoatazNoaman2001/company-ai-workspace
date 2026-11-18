import { Controller, Get, Inject } from '@nestjs/common';
import type { Db } from './core/db.js';
import type { HandlerRegistry } from './core/handlers.js';
import { DB, HANDLERS } from './core/tokens.js';

@Controller()
export class AppController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(HANDLERS) private readonly handlers: HandlerRegistry,
  ) {}

  /** Liveness + database check; lists the write actions this instance can execute. */
  @Get('health')
  async health() {
    await this.db.query('SELECT 1');
    return { status: 'ok', actions: this.handlers.list() };
  }
}
