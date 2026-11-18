import { Module } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller.js';
import { ApprovalsService } from './approvals.service.js';
import { ExpirySweeper } from './expiry.sweeper.js';

@Module({
  controllers: [ApprovalsController],
  providers: [ApprovalsService, ExpirySweeper],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
