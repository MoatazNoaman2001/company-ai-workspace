import { Global, Module } from '@nestjs/common';
import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

const schema = z.object({
  PORT: z.coerce.number().int().default(8080),
  /** Secret LibreChat sends on every MCP call (X-Service-Secret). */
  MCP_SERVICE_SECRET: z.string().min(32, 'MCP_SERVICE_SECRET must be set (32+ characters)'),
  /** governance-api, for the audit log (FR-12). Optional: without it, events go to stdout only. */
  GOVERNANCE_URL: z.string().url().optional(),
  GOV_MCP_SECRET: z.string().min(32).optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): Config => loadConfig() }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
