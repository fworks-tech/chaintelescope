/**
 * @fileoverview Rotas de scans: upload streamado, listagem keyset, detalhe,
 * cancelamento e remoção. O upload nunca carrega o arquivo em memória.
 * @module api/routes/scans
 */

import type { Readable } from "node:stream";
import {
  ListScansQuerySchema,
  decodeCursor,
  encodeCursor,
  type ListScansQuery,
} from "@chaintelescope/shared";
import type { Plugin, Request, Server } from "@hapi/hapi";
import { ScanArtifactsRepo } from "../db/repos/artifacts.js";
import { ScansRepo } from "../db/repos/scans.js";
import type { ScanRow, ScanStatus } from "../db/schema.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../errors/index.js";
import { scanStream } from "../hashing/scan-pipeline.js";
import { cancelScan } from "../scans/orchestrator.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL: ReadonlySet<ScanStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export interface ScanDto {
  readonly id: string;
  readonly kind: ScanRow["kind"];
  readonly status: ScanStatus;
  readonly assetSymbol: string | null;
  readonly contentHash: string | null;
  readonly failureReason: string | null;
  readonly durationMs: number | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

function toDto(row: ScanRow): ScanDto {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    assetSymbol: row.asset_symbol,
    contentHash: row.content_hash,
    failureReason: row.failure_reason,
    durationMs: row.duration_ms,
    createdAt: row.created_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
  };
}

function scanId(request: Request): string {
  const { id } = request.params as { id: string };
  // UUID fora do formato faria o Postgres lançar 22P02; para o cliente é 404.
  if (!UUID.test(id))
    throw new NotFoundError("scan_not_found", "Scan not found");
  return id;
}

function requestorId(request: Request): string {
  const credentials = request.auth.credentials as { user?: unknown };
  if (typeof credentials.user !== "string") {
    throw new UnauthorizedError("no_token", "Missing authentication", "Bearer");
  }
  return credentials.user;
}

export const scansPlugin: Plugin<void> = {
  name: "scans",
  version: "0.0.0",
  register(server: Server) {
    server.route({
      method: "POST",
      path: "/scans",
      options: {
        auth: "jwt",
        tags: ["scans"],
        payload: {
          output: "stream",
          parse: false,
          allow: ["application/octet-stream"],
          maxBytes: 50 * 1024 * 1024,
        },
      },
      handler: async (request, h) => {
        const scans = new ScansRepo(request.server.db);
        const artifacts = new ScanArtifactsRepo(request.server.db);

        const result = await scanStream(request.payload as Readable);
        const scan = await scans.create({
          kind: "upload",
          requestor: requestorId(request),
        });
        await scans.transition(scan.id, "pending", "running");

        try {
          await artifacts.insertIfAbsent({
            scanId: scan.id,
            contentHash: result.digest.hex,
            bytes: result.bytes,
          });

          const done = await scans.transition(scan.id, "running", "completed", {
            contentHash: result.digest.hex,
            digestAlg: result.digest.alg,
            durationMs: Math.round(result.millis),
          });

          if (done === undefined) {
            throw new Error(`scan ${scan.id} disappeared during upload`);
          }

          return h
            .response(toDto(done))
            .code(201)
            .location(`/scans/${done.id}`);
        } catch (error) {
          await scans.transition(scan.id, "running", "failed", {
            failureReason: "upload_persist_failed",
          });
          throw error;
        }
      },
    });

    server.route({
      method: "GET",
      path: "/scans",
      options: {
        auth: "jwt",
        tags: ["scans"],
        validate: { query: ListScansQuerySchema },
      },
      handler: async (request) => {
        const query = request.query as unknown as ListScansQuery;
        const limit = query.limit;

        let cursor: { createdAt: string; id: string } | undefined;
        if (query.cursor !== undefined) {
          try {
            cursor = decodeCursor(query.cursor);
          } catch {
            throw new BadRequestError("invalid_cursor", "Invalid cursor");
          }
        }

        const rows = await new ScansRepo(request.server.db).list({
          limit: limit + 1,
          ...(cursor === undefined ? {} : { cursor }),
          ...(query.status === undefined ? {} : { status: query.status }),
        });

        const items = rows.slice(0, limit);
        const last = items.at(-1);

        return {
          items: items.map(toDto),
          nextCursor:
            rows.length > limit && last !== undefined
              ? encodeCursor({
                  createdAt: last.created_at.toISOString(),
                  id: last.id,
                })
              : null,
        };
      },
    });

    server.route({
      method: "GET",
      path: "/scans/{id}",
      options: { auth: "jwt", tags: ["scans"] },
      handler: async (request) => {
        const scan = await new ScansRepo(request.server.db).byId(
          scanId(request),
        );
        if (scan === undefined) {
          throw new NotFoundError("scan_not_found", "Scan not found");
        }
        return toDto(scan);
      },
    });

    server.route({
      method: "POST",
      path: "/scans/{id}/cancel",
      options: { auth: "jwt", tags: ["scans"] },
      handler: async (request, h) => {
        const scans = new ScansRepo(request.server.db);
        const id = scanId(request);
        const scan = await scans.byId(id);

        if (scan === undefined) {
          throw new NotFoundError("scan_not_found", "Scan not found");
        }
        if (TERMINAL.has(scan.status)) {
          throw new ConflictError(
            "scan_not_cancellable",
            "A finished scan cannot be cancelled",
          );
        }

        await cancelScan(id, {
          scans,
          canceller: request.server.app.scanCanceller,
        });
        return h.response().code(202);
      },
    });

    server.route({
      method: "DELETE",
      path: "/scans/{id}",
      options: {
        auth: { strategy: "jwt", access: { scope: ["admin"] } },
        tags: ["scans"],
      },
      handler: async (request, h) => {
        const deleted = await new ScansRepo(request.server.db).delete(
          scanId(request),
        );
        if (!deleted) {
          throw new NotFoundError("scan_not_found", "Scan not found");
        }
        return h.response().code(204);
      },
    });
  },
};
