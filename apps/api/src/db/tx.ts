/**
 * @fileoverview Fronteira transacional explícita: o serviço recebe `tx` como
 * argumento, nunca lê estado ambiente.
 * @module api/db/tx
 */

import type { Kysely, Transaction } from "kysely";
import type { DB } from "./schema.js";

/**
 * Executa `fn` dentro de uma transação; commit no retorno, rollback em erro.
 *
 * @template T - Tipo do valor retornado pelo callback.
 * @param {Kysely<DB>} db - Handle raiz do banco.
 * @param {(tx: Transaction<DB>) => Promise<T>} fn - Trabalho transacional.
 * @returns {Promise<T>} O valor produzido por `fn`.
 */
export function withTx<T>(
  db: Kysely<DB>,
  fn: (tx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(fn);
}
