import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { CallerGuard } from '../common/caller/caller.guard.js';
import { DriveModule } from '../drive/drive.module.js';
import { McpController } from './mcp.controller.js';
import { McpService } from './mcp.service.js';

@Module({
  imports: [DriveModule, AuditModule],
  controllers: [McpController],
  providers: [McpService, CallerGuard],
})
export class McpModule {}
