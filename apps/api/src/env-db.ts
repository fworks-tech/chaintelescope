/**
 * @fileoverview Contrato mínimo de banco, separado de `env.ts` para que ferramentas
 * (runner de migrações) não exijam o contrato inteiro da API — inclusive o pepper de auth.
 * @module api/env-db
 */

import Joi from "joi";

/**
 * Compose `postgresql://user:pass@host:port/db` from parts, or pass through
 * an explicit `DATABASE_URL`. Parts win only when `DATABASE_URL` is absent —
 * this is the ECS pattern (Secret values cannot be concatenated at synth time,
 * so the task injects `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`).
 */
export function resolveDatabaseUrl(input: {
  readonly DATABASE_URL?: string;
  readonly PGHOST?: string;
  readonly PGPORT?: string | number;
  readonly PGUSER?: string;
  readonly PGPASSWORD?: string;
  readonly PGDATABASE?: string;
}): string {
  if (input.DATABASE_URL) return input.DATABASE_URL;
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE } = input;
  const PGPORT = input.PGPORT ?? 5432;
  if (PGHOST && PGUSER && PGPASSWORD && PGDATABASE) {
    const user = encodeURIComponent(PGUSER);
    const pass = encodeURIComponent(PGPASSWORD);
    return `postgresql://${user}:${pass}@${PGHOST}:${PGPORT}/${PGDATABASE}`;
  }
  throw new Error(
    "[FATAL] Configuration contract violation: set DATABASE_URL or all of PGHOST, PGUSER, PGPASSWORD, PGDATABASE",
  );
}

/**
 * SSL for Postgres wire encryption. RDS enforces it (`no pg_hba.conf entry
 * ... no encryption` otherwise); local dev Postgres does not. Enable unless
 * the host is loopback. `rejectUnauthorized: false` because the image ships
 * no AWS CA bundle (dev baseline; pin the RDS CA for production).
 */
export function resolvePgSsl(
  connectionString: string,
): { rejectUnauthorized: false } | undefined {
  let hostname = "";
  try {
    hostname = new URL(connectionString).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  if (hostname === "" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return undefined;
  }
  return { rejectUnauthorized: false };
}

const dbSchema = Joi.object({
  DATABASE_URL: Joi.string().uri({ scheme: ["postgres", "postgresql"] }),
  PGHOST: Joi.string().hostname(),
  PGPORT: Joi.number().port(),
  PGUSER: Joi.string(),
  PGPASSWORD: Joi.string(),
  PGDATABASE: Joi.string(),
}).unknown(true);

/**
 * Valida e devolve a `DATABASE_URL`, compondo-a de `PGHOST`/`PGPORT`/`PGUSER`/
 * `PGPASSWORD`/`PGDATABASE` quando `DATABASE_URL` está ausente (padrão ECS).
 *
 * @param {NodeJS.ProcessEnv} [inputEnv=process.env] - Variáveis a validar.
 * @returns {string} URI de conexão postgres validada.
 * @throws {Error} Se nem `DATABASE_URL` nem as quatro partes estiverem completas.
 */
export function loadDatabaseUrl(
  inputEnv: NodeJS.ProcessEnv = process.env,
): string {
  const { value, error } = dbSchema.validate(inputEnv, {
    abortEarly: false,
  });

  if (error) {
    const errorDetails = error.details.map((d) => d.message).join(", ");
    throw new Error(
      `[FATAL] Configuration contract violation: ${errorDetails}`,
    );
  }

  return resolveDatabaseUrl(value as Record<string, string | undefined>);
}
