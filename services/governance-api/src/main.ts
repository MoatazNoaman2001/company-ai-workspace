import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Config } from './core/config.js';
import { JsonLogger } from './core/json-logger.js';
import { APP_CONFIG } from './core/tokens.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger() });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.enableShutdownHooks();
  const cfg = app.get<Config>(APP_CONFIG);
  await app.listen(cfg.PORT);
}
await bootstrap();
