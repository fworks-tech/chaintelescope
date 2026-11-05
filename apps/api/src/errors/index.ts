/**
 * @fileoverview Erros de domínio com código estável. São Boom por herança
 * (status, headers e `isBoom` continuam funcionando) e o plugin `errors`
 * converte todos em um envelope único.
 * @module api/errors
 */

import { Boom } from "@hapi/boom";

export interface ValidationDetail {
  readonly path: string;
  readonly type: string;
}

export interface DomainErrorOptions {
  readonly details?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

const DOMAIN_ERROR = Symbol.for("chaintelescope.domainError");

/**
 * Boom's constructor returns a new Error object, not `this`, so a subclass
 * fails `instanceof`. A marker symbol survives that and is not enumerable.
 */
export function isDomainError(error: unknown): error is DomainError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as Record<PropertyKey, unknown>)[DOMAIN_ERROR] === true
  );
}

export class DomainError extends Boom {
  readonly code: string;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    options: DomainErrorOptions = {},
  ) {
    super(message, { statusCode });
    Object.defineProperty(this, DOMAIN_ERROR, { value: true });
    this.code = code;
    if (options.details !== undefined) this.details = options.details;
    if (options.headers !== undefined) {
      Object.assign(this.output.headers, options.headers);
    }
  }
}

export class BadRequestError extends DomainError {
  constructor(code: string, message = "Bad request", details?: unknown) {
    super(code, message, 400, { details });
  }
}

export class UnauthorizedError extends DomainError {
  constructor(code: string, message = "Unauthorized", scheme?: string) {
    super(code, message, 401, {
      headers: scheme === undefined ? {} : { "www-authenticate": scheme },
    });
  }
}

export class ForbiddenError extends DomainError {
  constructor(code: string, message = "Forbidden") {
    super(code, message, 403);
  }
}

export class NotFoundError extends DomainError {
  constructor(code: string, message = "Not found") {
    super(code, message, 404);
  }
}

export class ConflictError extends DomainError {
  constructor(code: string, message = "Conflict") {
    super(code, message, 409);
  }
}

export class ValidationError extends DomainError {
  constructor(
    message = "Payload validation failed",
    details: readonly ValidationDetail[] = [],
  ) {
    super("semantic_validation", message, 422, { details });
  }
}

export class TooManyRequestsError extends DomainError {
  constructor(code: string, message: string, retryAfterSeconds: number) {
    super(code, message, 429, {
      headers: { "retry-after": String(retryAfterSeconds) },
    });
  }
}

export class ServiceUnavailableError extends DomainError {
  constructor(code: string, message: string, retryAfterSeconds = 5) {
    super(code, message, 503, {
      headers: { "retry-after": String(retryAfterSeconds) },
    });
  }
}
