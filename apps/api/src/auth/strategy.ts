/**
 * @fileoverview Esquema de autenticação Hapi: Bearer JWT verificado com
 * `@hapi/jwt`. O escopo vai em `credentials.scope`, então a checagem de
 * `route.options.auth.access.scope` é feita pelo próprio Hapi.
 * @module api/auth/strategy
 */

import { unauthorized } from "@hapi/boom";
import type { ServerAuthScheme } from "@hapi/hapi";
import { verifyAccessToken } from "./tokens.js";

export interface TokenStrategyOptions {
  readonly secret: string;
}

export const tokenStrategy: ServerAuthScheme<TokenStrategyOptions> = (
  _server,
  options,
) => {
  const secret = options?.secret;
  if (secret === undefined) throw new Error("token strategy needs a secret");

  return {
    authenticate: async (request, h) => {
      const header = request.headers.authorization;
      if (typeof header !== "string" || !header.startsWith("Bearer ")) {
        throw unauthorized(null, "Bearer");
      }

      try {
        const claims = verifyAccessToken(header.slice(7).trim(), secret);
        return h.authenticated({
          credentials: { user: claims.sub, scope: [...claims.scope] },
        });
      } catch {
        // Assinatura inválida/expirada é 401, nunca 403: não há identidade.
        throw unauthorized("invalid_token", "Bearer");
      }
    },
  };
};
