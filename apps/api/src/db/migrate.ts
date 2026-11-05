/**
 * @fileoverview Runner de migrações em SQL puro: aplica `migrations/*.sql` em ordem
 * lexical, uma transação por arquivo, registrando o que já rodou em `schema_migrations`.
 * @module api/db/migrate
 */

import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

/** Diretório das migrações na raiz do repositório (dist/db -> raiz, e src/db -> raiz). */
export const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "migrations",
);

export type MigrationDirection = "up" | "down";

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly reverted: readonly string[];
}

const LEDGER = "schema_migrations";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Arquivos de subida, ordenados; os `.down.sql` nunca entram na lista. */
async function listUpFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries
    .filter((name) => name.endsWith(".sql") && !name.endsWith(".down.sql"))
    .sort();
}

async function applyFile(client: PoolClient, path: string): Promise<void> {
  await client.query(await readFile(path, "utf8"));
}

async function withTransaction(
  pool: Pool,
  fn: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await fn(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Aplica ou reverte todas as migrações pendentes.
 *
 * `down` percorre o histórico em ordem inversa e executa `<arquivo>.down.sql`
 * quando ele existe; arquivos sem par de descida são apenas removidos do ledger
 * (útil para migrações irreversíveis e conscientes, como o seed).
 */
export async function migrate(
  pool: Pool,
  direction: MigrationDirection = "up",
): Promise<MigrationResult> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${LEDGER} (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );

  const files = await listUpFiles();
  const { rows } = await pool.query<{ name: string }>(
    `SELECT name FROM ${LEDGER}`,
  );
  const applied = new Set(rows.map((row) => row.name));
  const appliedNow: string[] = [];
  const revertedNow: string[] = [];

  if (direction === "up") {
    for (const file of files) {
      if (applied.has(file)) continue;
      await withTransaction(pool, async (client) => {
        await applyFile(client, join(MIGRATIONS_DIR, file));
        await client.query(`INSERT INTO ${LEDGER} (name) VALUES ($1)`, [file]);
      });
      appliedNow.push(file);
    }
  } else {
    for (const file of [...files].reverse()) {
      if (!applied.has(file)) continue;
      const downPath = join(MIGRATIONS_DIR, file.replace(/\.sql$/, ".down.sql"));
      const hasDown = await exists(downPath);
      await withTransaction(pool, async (client) => {
        if (hasDown) await applyFile(client, downPath);
        await client.query(`DELETE FROM ${LEDGER} WHERE name = $1`, [file]);
      });
      revertedNow.push(file);
    }
  }

  return { applied: appliedNow, reverted: revertedNow };
}
