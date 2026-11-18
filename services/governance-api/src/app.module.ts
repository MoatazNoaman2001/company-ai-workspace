import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { ApprovalsModule } from './approvals/approvals.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AllExceptionsFilter } from './common/all-exceptions/all-exceptions.filter.js';
import { ServiceAuthGuard } from './common/service-auth/service-auth.guard.js';
import { CoreModule } from './core/core.module.js';

@Module({
  imports: [CoreModule, ApprovalsModule, AuditModule],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ServiceAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
