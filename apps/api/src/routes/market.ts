/**
 * @fileoverview Market parity routes backed by the provider chain (#138).
 * GET /api/price-trend mirrors Python /api/price-trend shape.
 * @module api/routes/market
 */

import {
  TIME_WINDOWS,
  type MarketProviderSelection,
  type PriceTrend,
  type TimeWindow,
} from "@chaintelescope/shared";
import Joi from "joi";
import type { Plugin, Request, Server } from "@hapi/hapi";
import { env } from "../env.js";
import { ServiceUnavailableError } from "../errors/index.js";
import { fetchPriceTrend, resolveMarketProviders } from "../market/index.js";
import type { MarketProvider } from "../market/provider.js";

export interface MarketRouteOptions {
  readonly providers?: readonly MarketProvider[];
  readonly timeoutMs?: number;
  readonly selection?: MarketProviderSelection;
}

const querySchema = Joi.object({
  asset: Joi.string()
    .trim()
    .uppercase()
    .max(20)
    .pattern(/^[A-Z0-9]{1,20}$/)
    .default("BTC"),
  days: Joi.number().integer().min(1).max(365).default(30),
  window: Joi.string()
    .valid(...TIME_WINDOWS)
    .default("30D"),
  source: Joi.string().valid(
    "auto",
    "binance",
    "coingecko",
    "coinbase",
    "mock",
  ),
});

function requestSignal(request: Request): AbortSignal {
  const controller = new AbortController();
  const raw = request.raw.req as { signal?: AbortSignal } | undefined;
  if (raw?.signal?.aborted) {
    controller.abort(raw.signal.reason);
    return controller.signal;
  }
  const onDisconnect = () => controller.abort(new Error("client disconnected"));
  request.events.once("disconnect", onDisconnect);
  raw?.signal?.addEventListener(
    "abort",
    () => controller.abort(raw.signal?.reason),
    { once: true },
  );
  return controller.signal;
}

export const marketPlugin: Plugin<MarketRouteOptions> = {
  name: "market",
  version: "0.0.0",
  register(server: Server, options: MarketRouteOptions = {}) {
    const timeoutMs =
      options.timeoutMs ?? env.MARKET_REQUEST_TIMEOUT_SECONDS * 1000;
    const defaultSelection = options.selection ?? env.MARKET_PROVIDER;

    server.route({
      method: "GET",
      path: "/api/price-trend",
      options: {
        tags: ["market"],
        validate: { query: querySchema },
      },
      handler: async (request): Promise<PriceTrend> => {
        const query = request.query as {
          asset: string;
          days: number;
          window: TimeWindow;
          source?: MarketProviderSelection;
        };

        const selection = query.source ?? defaultSelection;
        const providers =
          options.providers ?? resolveMarketProviders(selection);

        return fetchPriceTrend(
          query.asset,
          query.days,
          query.window,
          selection,
          providers,
          request.logger,
          requestSignal(request),
          { timeoutMs, onExhausted: "throw" },
        );
      },
    });

    // #122: snapshot parity route is blocked until non-market deps
    // (news/alerts/kpis/risk) are ported; market provider is now available.
    server.route({
      method: "GET",
      path: "/api/snapshot",
      options: { tags: ["market"] },
      handler: () => {
        throw new ServiceUnavailableError(
          "snapshot_not_ready",
          "Snapshot parity route is blocked pending news/alerts/kpi/risk ports (#122)",
        );
      },
    });
  },
};
