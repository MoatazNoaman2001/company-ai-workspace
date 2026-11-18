import { z } from 'zod';

const secret = z.string().min(32, 'must be at least 32 characters');

const schema = z.object({
  PORT: z.coerce.number().int().default(8080),
  DATABASE_URL: z.string().min(1),
  /** Secret MCP connectors send when calling governance-api. */
  GOV_MCP_SECRET: secret,
  /** Secret the governance dashboard sends when calling governance-api. */
  GOV_DASHBOARD_SECRET: secret,
  /** FR-11 MVP: largest amount a requester may self-confirm (company currency). */
  MVP_SELF_CONFIRM_LIMIT: z.coerce.number().positive().default(50_000),
  APPROVAL_TTL_HOURS: z.coerce.number().positive().default(24),
  /** Comma-separated admin emails until role sync (FR-02) feeds governance-api. */
  ADMIN_EMAILS: z.string().default(''),
  /** Base URL of the governance dashboard, used for confirm links. */
  DASHBOARD_URL: z.string().url().optional(),
});

export type Config = z.infer<typeof schema> & { adminEmails: Set<string> };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  const adminEmails = new Set(parsed.data.ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  return { ...parsed.data, adminEmails };
}
