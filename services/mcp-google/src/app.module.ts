import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AllExceptionsFilter } from './common/all-exceptions/all-exceptions.filter.js';
import { ConfigModule } from './config/config.module.js';
import { McpModule } from './mcp/mcp.module.js';

@Module({
  imports: [ConfigModule, McpModule],
  controllers: [AppController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
