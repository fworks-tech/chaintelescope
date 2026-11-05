/**
 * @fileoverview Armazenamento de senhas: Argon2id com piso OWASP e pepper
 * server-side, mais o caminho de verificação usado para e-mails inexistentes.
 * @module api/auth/password
 */

import { randomBytes } from "node:crypto";
import { argon2id, hash, needsRehash, verify, type HashOptions } from "argon2";

/**
 * Piso do OWASP Password Storage Cheat Sheet: m=19 MiB, t=2, p=1.
 * Aumentar aqui invalida hashes antigos via `needsUpgrade`, não os quebra.
 */
export const ARGON2_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/** Pepper + senha: o pepper nunca vai ao banco, só entra na KDF. */
function peppered(password: string, pepper: Buffer): string {
  return pepper.toString("hex") + password;
}

/** @returns {Promise<string>} PHC string com sal aleatório por chamada. */
export function hashPassword(
  password: string,
  pepper: Buffer,
): Promise<string> {
  return hash(peppered(password, pepper), ARGON2_OPTIONS);
}

/**
 * @param {string} stored - PHC string do banco.
 * @returns {Promise<boolean>} `false` para hash legado, sem rodar a KDF.
 */
export async function verifyPassword(
  stored: string,
  password: string,
  pepper: Buffer,
): Promise<boolean> {
  // bcrypt (ou lixo) não é verificável aqui; o aceite-e-migre fica no login.
  if (!stored.startsWith("$argon2")) return false;
  return verify(stored, peppered(password, pepper));
}

/**
 * @param {string} stored - Hash persistido.
 * @returns {boolean} `true` se for legado ou estiver abaixo do piso atual.
 */
export function needsUpgrade(stored: string): boolean {
  try {
    return needsRehash(stored, ARGON2_OPTIONS);
  } catch {
    return true;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifica a senha contra um hash de referência para que um e-mail
 * inexistente custe a mesma KDF de um existente.
 *
 * @returns {Promise<false>} Sempre `false`.
 */
export async function verifyDummyPassword(
  password: string,
  pepper: Buffer,
): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"), pepper);
  await verify(await dummyHash, peppered(password, pepper)).catch(
    () => false,
  );
  return false;
}
