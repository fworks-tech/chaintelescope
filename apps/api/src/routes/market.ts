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
import type { Plugin, Server } from "@hapi/hapi";
import { env } from "../env.js";
import { ServiceUnavailableError } from "../errors/index.js";
import { fetchPriceTrend, resolveMarketProviders } from "../market/index.js";
import type { MarketProvider } from "../market/provider.js";

export interface MarketRouteOptions {
  readonly providers?: readonly MarketProvider[];
  readonly timeoutMs?: number;
}

const querySchema = Joi.object({
  asset: Joi.string().trim().uppercase().max(20).default("BTC"),
  days: Joi.number().integer().min(1).max(365).default(30),
  window: Joi.string()
    .valid(...TIME_WINDOWS)
    .default("30D"),
  source: Joi.string()
    .valid("auto", "binance", "coingecko", "coinbase", "mock")
    .default("auto"),
});

export const marketPlugin: Plugin<MarketRouteOptions> = {
  name: "market",
  version: "0.0.0",
  register(server: Server, options: MarketRouteOptions = {}) {
    const timeoutMs =
      options.timeoutMs ?? env.MARKET_REQUEST_TIMEOUT_SECONDS * 1000;
    const providers =
      options.providers ?? resolveMarketProviders(env.MARKET_PROVIDER);

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
          source: MarketProviderSelection;
        };

        let selection = env.MARKET_PROVIDER === "mock" ? "mock" : query.source;
        let selectedProviders = options.providers
          ? providers
          : resolveMarketProviders(selection);

        if (options.providers && selection === "auto") {
          const hasExchange = providers.some((p) =>
            ["binance", "coingecko", "coinbase"].includes(p.id),
          );
          if (!hasExchange) {
            selection = "mock";
            selectedProviders = providers;
          }
        }

        return fetchPriceTrend(
          query.asset,
          query.days,
          query.window,
          selection,
          selectedProviders,
          request.logger,
          request.raw.req.signal ?? new AbortController().signal,
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
