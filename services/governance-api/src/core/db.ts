import pg from 'pg';

/** Minimal database surface used by the service. Implemented by node-postgres (prod) and PGlite (tests). */
export interface Queryable {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
  /** Runs one or more SQL statements without parameters (migrations). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createPgDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10, statement_timeout: 15_000 });
  const wrap = (c: pg.Pool | pg.PoolClient): Queryable => ({
    query: async (text, params) => {
      const r = await c.query(text, params as unknown[]);
      return { rows: r.rows };
    },
    exec: async (sql) => {
      await c.query(sql);
    },
  });
  const root = wrap(pool);
  return {
    ...root,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(wrap(client));
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
