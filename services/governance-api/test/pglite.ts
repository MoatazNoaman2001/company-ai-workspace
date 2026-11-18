import { PGlite } from '@electric-sql/pglite';
import type { Db, Queryable } from '../src/core/db.js';

/** Real Postgres (WASM) for tests: same SQL, triggers and constraints as production. */
export async function createTestDb(): Promise<Db & { raw: PGlite }> {
  const pg = new PGlite();
  const wrap = (c: { query: PGlite['query']; exec: PGlite['exec'] }): Queryable => ({
    query: async (text, params) => {
      const r = await c.query(text, params as unknown[]);
      return { rows: r.rows as never[] };
    },
    exec: async (sql) => {
      await c.exec(sql);
    },
  });
  return {
    ...wrap(pg),
    tx: (fn) => pg.transaction((t) => fn(wrap(t))),
    close: () => pg.close(),
    raw: pg,
  };
}
