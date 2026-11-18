import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { loadConfig, type Config } from './config.js';
import { createPgDb, type Db } from './db.js';
import { HandlerRegistry } from './handlers.js';
import { JsonLogger } from './json-logger.js';
import { migrate } from './migrations.js';
import { APP_CONFIG, CLOCK, DB, HANDLERS } from './tokens.js';

/**
 * Global infrastructure: configuration, clock, database (migrated on startup) and the registry of
 * connector write actions. Tests override DB, CLOCK, APP_CONFIG and HANDLERS.
 */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: (): Config => loadConfig() },
    { provide: CLOCK, useValue: () => new Date() },
    {
      provide: DB,
      inject: [APP_CONFIG],
      useFactory: async (cfg: Config): Promise<Db> => {
        const db = createPgDb(cfg.DATABASE_URL);
        const applied = await migrate(db);
        new JsonLogger().log({ event: 'migrated', applied });
        return db;
      },
    },
    // Connector write actions are registered here as connectors arrive (ERPNext next).
    { provide: HANDLERS, useFactory: () => new HandlerRegistry() },
  ],
  exports: [APP_CONFIG, CLOCK, DB, HANDLERS],
})
export class CoreModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Db) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.close();
  }
}
