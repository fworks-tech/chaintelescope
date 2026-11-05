/**
 * @fileoverview Resultados compartilhados entre repositórios, sem acoplar um
 * repositório a outro.
 * @module api/db/types
 */

/** Resultado discriminado de uma escrita idempotente. */
export type IngestResult = { deduped: true } | { created: string };
