/**
 * @fileoverview Baseline OWASP de headers em toda resposta, inclusive erros e
 * 204. Registrado depois do plugin de erros: ele substitui o objeto de resposta
 * e os headers precisam entrar no objeto final.
 * @module api/plugins/secure-headers
 */

import { isBoom } from "@hapi/boom";
import type { Plugin, Server } from "@hapi/hapi";

export const SECURITY_HEADERS = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
} as const;

export const secureHeadersPlugin: Plugin<void> = {
  name: "secure-headers",
  version: "0.0.0",
  register(server: Server) {
    server.ext("onPreResponse", (request, h) => {
      const response = request.response;

      if (isBoom(response)) {
        Object.assign(response.output.headers, SECURITY_HEADERS);
        return h.continue;
      }

      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        response.header(name, value);
      }

      return h.continue;
    });
  },
};
