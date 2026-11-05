/**
 * @fileoverview Emissão e verificação de tokens: JWT curto de acesso e refresh
 * opaco (só o sha256 é persistido).
 * @module api/auth/tokens
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "@hapi/jwt";

const UNIT_SECONDS = { s: 1, m: 60, h: 3_600, d: 86_400 } as const;

/**
 * Converte `JWT_ACCESS_TTL` (`15m`, `1h`, `30s`, `7d`) em segundos.
 *
 * @param {string} ttl - Janela no formato `<inteiro><s|m|h|d>`.
 * @returns {number} Segundos positivos.
 * @throws {Error} Formato não suportado.
 */
export function parseTtlSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  const amount = match?.[1];
  const unit = match?.[2] as keyof typeof UNIT_SECONDS | undefined;
  if (amount === undefined || unit === undefined) {
    throw new Error(`invalid JWT_ACCESS_TTL: ${ttl}`);
  }

  return Number(amount) * UNIT_SECONDS[unit];
}

export interface AccessToken {
  readonly token: string;
  readonly expiresIn: number;
}

/**
 * Assina um JWT HS256 com `sub`, `scope` e `jti`; sem PII.
 *
 * @param {string} subject - UUID do usuário.
 * @param {readonly string[]} scope - Escopos (`user`, `admin`).
 * @param {string} secret - Segredo HMAC.
 * @param {string} ttl - Janela (`15m`).
 * @returns {AccessToken} Token e sua validade em segundos.
 */
export function signAccessToken(
  subject: string,
  scope: readonly string[],
  secret: string,
  ttl: string,
): AccessToken {
  const expiresIn = parseTtlSeconds(ttl);
  const token = jwt.token.generate(
    { sub: subject, scope, jti: randomUUID() },
    secret,
    { ttlSec: expiresIn },
  );

  return { token, expiresIn };
}

export interface AccessClaims {
  readonly sub: string;
  readonly scope: readonly string[];
}

/**
 * Verifica assinatura e `exp`; rejeita payload sem `sub`/`scope`.
 *
 * @throws {Error} Token inválido, expirado ou fora do formato esperado.
 */
export function verifyAccessToken(token: string, secret: string): AccessClaims {
  const artifacts = jwt.token.decode(token);
  jwt.token.verify(artifacts, secret);

  const { sub, scope } = artifacts.decoded.payload as {
    sub?: unknown;
    scope?: unknown;
  };
  if (
    typeof sub !== "string" ||
    !Array.isArray(scope) ||
    !scope.every((entry) => typeof entry === "string")
  ) {
    throw new Error("invalid access token claims");
  }

  return { sub, scope };
}

/** @param {string} token - Refresh em claro. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface RefreshToken {
  /** Valor entregue ao cliente no cookie; nunca persiste. */
  readonly token: string;
  /** sha256 hex persistido em `refresh_tokens.token_hash`. */
  readonly hash: string;
}

/** @returns {RefreshToken} 256 bits aleatórios, URL-safe. */
export function newRefreshToken(): RefreshToken {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}
