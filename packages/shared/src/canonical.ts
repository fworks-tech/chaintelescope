/**
 * @fileoverview Serialização canônica determinística baseada na especificação RFC 8785 (JSON Canonicalization Scheme - JCS).
 * @module shared/canonical
 */

/**
 * Tipos primitivos suportados em uma estrutura JSON válida.
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Estrutura de dados recursiva representando qualquer documento JSON válido em conformidade com a RFC 8259.
 */
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [k: string]: JsonValue };

/**
 * Converte recursivamente um valor JSON para sua representação canônica em bytes UTF-8 (RFC 8785).
 *
 * **Garantia de Identidade:**
 * No Node.js e no V8, objetos JavaScript não garantem ordem determinística de iteração de propriedades.
 * Esta função aplica ordenação lexicográfica de chaves lexicograficamente em código UTF-16,
 * assegurando que `{ a: 1, b: 2 }` e `{ b: 2, a: 1 }` produzam exatamente os mesmos bytes e,
 * consequentemente, o mesmo hash de integridade SHA-256.
 *
 * @param {JsonValue} value - O dado JSON a ser serializado em forma canônica.
 * @returns {Buffer} Buffer contendo a representação canônica em bytes UTF-8.
 * @throws {TypeError} Se encontrar números não finitos (`NaN`, `Infinity`) ou estruturas não serializáveis em JSON.
 *
 * @example
 * ```ts
 * const buf1 = canonicalize({ title: "Alert", id: 10 });
 * const buf2 = canonicalize({ id: 10, title: "Alert" });
 * Buffer.compare(buf1, buf2) === 0; // true
 * ```
 */
export function canonicalize(value: JsonValue): Buffer {
  return Buffer.from(stringifyCanonical(value), "utf8");
}

/**
 * Função interna de serialização recursiva determinística.
 *
 * @internal
 * @param {JsonValue} value - Elemento em processamento recursivo.
 * @returns {string} String serializada com ordenação de chaves garantida.
 */
function stringifyCanonical(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        "Cannot canonicalize non-finite numbers (NaN, Infinity)",
      );
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stringifyCanonical).join(",") + "]";
  }
  if (typeof value === "object") {
    // RFC 8785: Ordenação lexicográfica estrita dos nomes de propriedades por código de ponto UTF-16
    const keys = Object.keys(value).sort();
    const entries = keys.map(
      (k) =>
        `${JSON.stringify(k)}:${stringifyCanonical(value[k] as JsonValue)}`,
    );
    return "{" + entries.join(",") + "}";
  }
  throw new TypeError(
    `Unsupported JSON type for canonicalization: ${typeof value}`,
  );
}
