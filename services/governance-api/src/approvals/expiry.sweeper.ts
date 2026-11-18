import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Config } from '../core/config.js';
import { JsonLogger } from '../core/json-logger.js';
import { APP_CONFIG } from '../core/tokens.js';
import { ApprovalsService } from './approvals.service.js';

/** FR-11: pending requests expire after APPROVAL_TTL_HOURS even if nobody looks at them. */
@Injectable()
export class ExpirySweeper implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private readonly log = new JsonLogger();

  constructor(
    @Inject(ApprovalsService) private readonly approvals: ApprovalsService,
    @Inject(APP_CONFIG) private readonly cfg: Config,
  ) {}

  onModuleInit() {
    if (this.cfg.SWEEP_INTERVAL_MS <= 0) return;
    this.timer = setInterval(() => {
      this.approvals
        .sweepExpired()
        .then((n) => n && this.log.log({ event: 'expired_swept', count: n }))
        .catch((e) => this.log.error({ event: 'sweep_error', message: String(e) }));
    }, this.cfg.SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
