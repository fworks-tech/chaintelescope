/**
 * @fileoverview Entrada de linha de comando do runner de migrações.
 * Uso: `node dist/db/migrate-cli.js [--down]`
 * @module api/db/migrate-cli
 */

import pg from "pg";
import { loadDatabaseUrl } from "../env.js";
import { migrate } from "./migrate.js";

const direction = process.argv.includes("--down") ? "down" : "up";
const pool = new pg.Pool({ connectionString: loadDatabaseUrl(), max: 2 });

try {
  const result = await migrate(pool, direction);
  const changed = direction === "up" ? result.applied : result.reverted;
  const label = direction === "up" ? "applied" : "reverted";

  if (changed.length === 0) {
    console.log(`migrations: nothing to ${direction === "up" ? "apply" : "revert"}`);
  } else {
    console.log(`migrations ${label}: ${changed.join(", ")}`);
  }
} finally {
  await pool.end();
}
