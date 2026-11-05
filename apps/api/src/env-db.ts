/**
 * @fileoverview Contrato mínimo de banco, separado de `env.ts` para que ferramentas
 * (runner de migrações) não exijam o contrato inteiro da API — inclusive o pepper de auth.
 * @module api/env-db
 */

import Joi from "joi";

/**
 * Valida e devolve apenas `DATABASE_URL`.
 *
 * @param {NodeJS.ProcessEnv} [inputEnv=process.env] - Variáveis a validar.
 * @returns {string} URI de conexão postgres validada.
 * @throws {Error} Se a variável estiver ausente ou não for uma URI postgres.
 */
export function loadDatabaseUrl(
  inputEnv: NodeJS.ProcessEnv = process.env,
): string {
  const { value, error } = Joi.object({
    DATABASE_URL: Joi.string()
      .uri({ scheme: ["postgres", "postgresql"] })
      .required(),
  }).validate(inputEnv, { abortEarly: false });

  if (error) {
    const errorDetails = error.details.map((d) => d.message).join(", ");
    throw new Error(
      `[FATAL] Configuration contract violation: ${errorDetails}`,
    );
  }

  return (value as { DATABASE_URL: string }).DATABASE_URL;
}
