import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { APP_CONFIG, type Config } from './config/config.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'] });
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '1mb' });
  app.enableShutdownHooks();
  const cfg = app.get<Config>(APP_CONFIG);
  await app.listen(cfg.PORT);
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), event: 'started', port: cfg.PORT }) + '\n');
}
await bootstrap();
