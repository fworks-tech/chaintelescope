/**
 * @fileoverview Repositório do registro de ativos.
 * @module api/db/repos/assets
 */

import type { Kysely } from "kysely";
import type { AssetRow, DB } from "../schema.js";

export class AssetsRepo {
  constructor(private readonly db: Kysely<DB>) {}

  /** @returns {Promise<AssetRow[]>} Todos os ativos, ordenados por símbolo. */
  list(): Promise<AssetRow[]> {
    return this.db
      .selectFrom("assets")
      .selectAll()
      .orderBy("symbol")
      .execute();
  }

  /**
   * @param {string} symbol - Símbolo do ativo (ex.: 'BTC').
   * @returns {Promise<AssetRow | undefined>} O ativo, se existir.
   */
  bySymbol(symbol: string): Promise<AssetRow | undefined> {
    return this.db
      .selectFrom("assets")
      .selectAll()
      .where("symbol", "=", symbol)
      .executeTakeFirst();
  }
}
