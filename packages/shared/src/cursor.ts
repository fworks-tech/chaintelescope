/**
 * @fileoverview Cursor opaco de paginação keyset para `(created_at, id)`.
 * Base64url de JSON: o cliente não deve interpretar, só devolver.
 * @module shared/cursor
 */

export interface ScanCursor {
  readonly createdAt: string;
  readonly id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: ScanCursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt, id: cursor.id }),
    "utf8",
  ).toString("base64url");
}

/**
 * @throws {Error} Base64 inválido, JSON inválido, data não parseável ou id
 *   que não é UUID (o Postgres rejeitaria a comparação).
 */
export function decodeCursor(value: string): ScanCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("invalid cursor");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("invalid cursor");
  }

  const { createdAt, id } = parsed as Record<string, unknown>;
  if (
    typeof createdAt !== "string" ||
    Number.isNaN(Date.parse(createdAt)) ||
    typeof id !== "string" ||
    !UUID.test(id)
  ) {
    throw new Error("invalid cursor");
  }

  return { createdAt, id };
}
