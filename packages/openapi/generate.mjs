/**
 * Gera `openapi.json` a partir da tabela de rotas do servidor e dos schemas
 * Joi dos `validate`. Não é um cliente HTTP: o servidor é construído, a tabela
 * é lida e o processo termina.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env["NODE_ENV"] ??= "test";
process.env["DATABASE_URL"] ??=
  "postgresql://postgres:postgres@localhost:5432/chaintelescope";
process.env["ARGON2_PEPPER"] ??= "00".repeat(32);
process.env["JWT_ACCESS_SECRET"] ??= "openapi-generation-secret-0123456789";

const { buildServer } = await import("../../apps/api/dist/server.js");

const RESPONSES = {
  "GET /healthz": { 200: "Service is up" },
  "POST /auth/register": {
    201: "User created",
    400: "Malformed JSON",
    409: "E-mail already registered",
    422: "Payload validation failed",
    429: "Rate limited",
  },
  "POST /auth/login": {
    200: "Access token and refresh cookie",
    400: "Malformed JSON",
    401: "Invalid credentials",
    422: "Payload validation failed",
    429: "Rate limited",
  },
  "POST /auth/refresh": {
    200: "Rotated refresh token and new access token",
    401: "Missing, invalid, revoked or reused refresh token",
    429: "Rate limited",
  },
  "POST /auth/logout": {
    204: "Family revoked, cookie cleared",
    429: "Rate limited",
  },
  "GET /auth/me": {
    200: "Current user",
    401: "Missing or invalid token",
    429: "Rate limited",
  },
  "POST /scans": {
    201: "Scan created and hashed",
    400: "Malformed request",
    401: "Missing or invalid token",
    413: "Payload too large",
    415: "Content-Type is not application/octet-stream",
    429: "Rate limited",
  },
  "GET /scans": {
    200: "Page of scans",
    400: "Invalid cursor",
    401: "Missing or invalid token",
    429: "Rate limited",
  },
  "GET /scans/{id}": {
    200: "Scan",
    401: "Missing or invalid token",
    404: "Scan not found",
    429: "Rate limited",
  },
  "POST /scans/{id}/cancel": {
    202: "Cancellation accepted",
    401: "Missing or invalid token",
    404: "Scan not found",
    409: "Scan already finished",
    429: "Rate limited",
  },
  "DELETE /scans/{id}": {
    204: "Scan deleted",
    401: "Missing or invalid token",
    403: "Admin scope required",
    404: "Scan not found",
    429: "Rate limited",
  },
  "POST /newsletter/subscribe": {
    201: "Subscription created",
    400: "Malformed JSON",
    409: "E-mail already subscribed",
    422: "Payload validation failed",
  },
};

const ERROR_SCHEMA = {
  type: "object",
  properties: {
    error: {
      type: "object",
      required: ["code", "message", "requestId"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        requestId: { type: "string" },
      },
    },
    details: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          type: { type: "string" },
        },
      },
    },
  },
  required: ["error"],
};

function toJsonSchema(schema) {
  const description = schema.describe();

  if (description.type === "object") {
    const required = Object.entries(description.keys ?? {})
      .filter(([, value]) => value.flags?.presence === "required")
      .map(([key]) => key);

    return {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(description.keys ?? {}).map(([key, value]) => [
          key,
          toJsonSchema({ describe: () => value }),
        ]),
      ),
      additionalProperties: false,
      ...(required.length === 0 ? {} : { required }),
    };
  }

  if (description.type === "array") {
    return {
      type: "array",
      items:
        description.items?.[0] === undefined
          ? {}
          : toJsonSchema({ describe: () => description.items[0] }),
    };
  }

  if (description.type === "string") {
    const rules = description.rules ?? [];
    const limit = (name) =>
      rules.find((rule) => rule.name === name)?.args?.limit;
    const schema = { type: "string" };
    if (limit("min") !== undefined) schema.minLength = limit("min");
    if (limit("max") !== undefined) schema.maxLength = limit("max");
    if (rules.some((rule) => rule.name === "email")) schema.format = "email";
    if (description.flags?.only && Array.isArray(description.allow)) {
      schema.enum = description.allow;
    }
    if (description.flags?.default !== undefined)
      schema.default = description.flags.default;
    return schema;
  }

  if (description.type === "number") {
    const rules = description.rules ?? [];
    const limit = (name) =>
      rules.find((rule) => rule.name === name)?.args?.limit;
    const schema = {
      type: rules.some((rule) => rule.name === "integer")
        ? "integer"
        : "number",
    };
    if (limit("min") !== undefined) schema.minimum = limit("min");
    if (limit("max") !== undefined) schema.maximum = limit("max");
    if (description.flags?.default !== undefined)
      schema.default = description.flags.default;
    return schema;
  }

  if (description.type === "boolean") return { type: "boolean" };

  return {};
}

function schemaName(schema, fallback) {
  return schema.describe().metas?.[0]?.className ?? fallback;
}

function operationId(method, path) {
  return `${method}${path}`
    .replace(/[{}]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const server = await buildServer();
const document = {
  openapi: "3.0.3",
  info: {
    title: "ChainTelescope API",
    version: "0.0.0",
    description: "Generated from the Hapi route table and the Joi contracts.",
  },
  servers: [{ url: "http://localhost:3000" }],
  paths: {},
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: { Error: ERROR_SCHEMA },
  },
};

for (const route of server.table()) {
  const method = route.method.toLowerCase();
  const path = route.path;
  const operation = {
    operationId: operationId(method, path),
    tags: route.settings.tags?.length ? route.settings.tags : ["default"],
    parameters: [],
    responses: {},
  };

  for (const segment of path.matchAll(/\{([^}]+)\}/g)) {
    operation.parameters.push({
      name: segment[1],
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    });
  }

  const query = route.settings.validate.query;
  if (query) {
    const description = query.describe();
    for (const [name, value] of Object.entries(description.keys ?? {})) {
      operation.parameters.push({
        name,
        in: "query",
        required: value.flags?.presence === "required",
        schema: toJsonSchema({ describe: () => value }),
      });
    }
  }

  const payload = route.settings.validate.payload;
  if (payload && typeof payload.describe === "function") {
    const name = schemaName(payload, `${operation.operationId}Payload`);
    document.components.schemas[name] = toJsonSchema(payload);
    operation.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${name}` },
        },
      },
    };
  } else if (route.settings.payload?.output === "stream") {
    operation.requestBody = {
      required: true,
      content: {
        "application/octet-stream": {
          schema: { type: "string", format: "binary" },
        },
      },
    };
  }

  const responses = RESPONSES[`${route.method.toUpperCase()} ${path}`] ?? {
    200: "OK",
  };
  for (const [code, description] of Object.entries(responses)) {
    operation.responses[code] = {
      description,
      ...(Number(code) >= 400 || Number(code) === 401
        ? {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          }
        : {}),
    };
  }

  if (route.settings.auth) {
    operation.security = [{ bearerAuth: [] }];
    const access = route.settings.auth.access;
    const scope = Array.isArray(access)
      ? access.flatMap((entry) => entry.scope?.selection ?? [])
      : [];
    if (scope.length > 0) {
      operation["x-required-scope"] = scope;
    }
  }

  document.paths[path] ??= {};
  document.paths[path][method] = operation;
}

const out = join(dirname(fileURLToPath(import.meta.url)), "openapi.json");
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
console.log(`openapi: ${Object.keys(document.paths).length} paths -> ${out}`);
process.exit(0);
