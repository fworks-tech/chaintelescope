/**
 * @fileoverview Pipeline de validação do Hapi: Joi como validador e um
 * `failAction` que devolve só o necessário para o cliente corrigir o payload.
 * @module api/plugins/validation
 */

import type { Plugin, Request, ResponseToolkit, Server } from "@hapi/hapi";
import Joi from "joi";
import { ValidationError } from "../errors/index.js";

/**
 * Erro de schema é 422: o corpo foi parseado, mas não é processável. JSON
 * malformado nunca chega aqui — o parser do Hapi já devolve 400.
 */
export const failAction = (
  _request: Request,
  _h: ResponseToolkit,
  err?: Error,
): never => {
  if (err === undefined || !Joi.isError(err)) {
    throw err ?? new Error("validation failed");
  }

  const details = err.details.map((detail) => ({
    path: detail.path.join("."),
    type: detail.type,
  }));

  // Só `path` e `type`: mensagens do Joi podem vazar o schema.
  throw new ValidationError("Payload validation failed", details);
};

export const validationPlugin: Plugin<void> = {
  name: "validation",
  version: "0.0.0",
  register(server: Server) {
    server.validator(Joi);
  },
};
