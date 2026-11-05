/**
 * @fileoverview Handle de Kysely para as suítes de integração, com contador de
 * statements (o driver Postgres adquire uma conexão por statement fora de transação).
 */

import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "../../src/db/schema.js";

export interface TestDb {
  readonly db: Kysely<DB>;
  readonly pool: pg.Pool;
  /** Statements executados desde o último `resetStatementCount()`. */
  statements(): number;
  resetStatementCount(): void;
  destroy(): Promise<void>;
}

export function makeDb(connectionString: string): TestDb {
  const pool = new pg.Pool({ connectionString, max: 4 });

  let count = 0;
  pool.on("acquire", () => {
    count += 1;
  });

  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

  return {
    db,
    pool,
    statements: () => count,
    resetStatementCount: () => {
      count = 0;
    },
    destroy: () => db.destroy(),
  };
}
