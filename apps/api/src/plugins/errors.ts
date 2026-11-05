/**
 * @fileoverview Envelope único de erro: nenhum handler monta `h.response`
 * com código. Boom vira `{ error: { code, message, requestId } }`; o que não
 * é Boom vira 500 opaco e vai para o log.
 * @module api/plugins/errors
 */

import { Boom, isBoom } from "@hapi/boom";
import type {
  Lifecycle,
  Plugin,
  Request,
  ResponseToolkit,
  Server,
} from "@hapi/hapi";
import { isDomainError, ServiceUnavailableError } from "../errors/index.js";

declare module "@hapi/hapi" {
  interface ServerApplicationState {
    /** M5-I24 liga isto quando o pool satura. */
    degraded?: boolean;
  }
}

interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
  };
  readonly details?: unknown;
}

function envelope(
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
): ErrorEnvelope {
  const body: ErrorEnvelope = { error: { code, message, requestId } };
  return details === undefined ? body : { ...body, details };
}

/** Códigos estáveis para os Boom que o Hapi/framework produzem. */
function codeFor(error: Boom): string {
  const status = error.output.statusCode;
  const message = error.output.payload.message ?? "";

  if (status === 400) {
    return message.startsWith("Invalid request payload")
      ? "malformed_json"
      : "bad_request";
  }
  if (status === 401) {
    return message === "Missing authentication" ? "no_token" : "unauthorized";
  }
  if (status === 403) {
    return message === "Insufficient scope"
      ? "insufficient_scope"
      : "forbidden";
  }
  if (status === 404) return "not_found";
  if (status === 405) return "method_not_allowed";
  if (status === 409) return "conflict";
  if (status === 413) return "payload_too_large";
  if (status === 415) return "unsupported_media_type";
  if (status === 422) return "semantic_validation";
  if (status === 429) return "too_many_attempts";
  if (status === 503) return "service_unavailable";
  if (status >= 500) return "internal_error";
  return `http_${status}`;
}

function respond(
  h: ResponseToolkit,
  error: Boom,
  requestId: string,
  details?: unknown,
) {
  const status = error.output.statusCode;
  const code = isDomainError(error) ? error.code : codeFor(error);
  const message =
    status >= 500
      ? "An internal server error occurred"
      : (error.output.payload.message ?? "Request failed");

  const response = h
    .response(envelope(code, message, requestId, details))
    .code(status);

  for (const [name, value] of Object.entries(error.output.headers)) {
    response.header(
      name,
      Array.isArray(value) ? value.join(", ") : String(value),
    );
  }

  return response;
}

export const errorsPlugin: Plugin<void> = {
  name: "errors",
  version: "0.0.0",
  register(server: Server) {
    server.ext(
      "onPreResponse",
      (request: Request, h: ResponseToolkit): Lifecycle.ReturnValue => {
        if (request.server.app.degraded === true) {
          return respond(
            h,
            new ServiceUnavailableError(
              "db_pool_saturated",
              "Database pool saturated",
            ),
            request.info.id,
          );
        }

        const response = request.response;

        if (isBoom(response)) {
          if (response.output.statusCode >= 500) {
            request.log(["error", "internal"], {
              code: isDomainError(response) ? response.code : codeFor(response),
              statusCode: response.output.statusCode,
              requestId: request.info.id,
            });
          }
          return respond(
            h,
            response,
            request.info.id,
            isDomainError(response) ? response.details : undefined,
          );
        }

        if (response instanceof Error) {
          request.log(["error", "internal"], {
            code: "internal_error",
            message: response.message,
            requestId: request.info.id,
          });
          return respond(
            h,
            new Boom("An internal server error occurred", { statusCode: 500 }),
            request.info.id,
          );
        }

        return h.continue;
      },
    );
  },
};
