/**
 * @fileoverview Public news feed: latest rows from the scheduled Python
 * ingest (#196). An empty table (job hasn't run yet) is a valid 200 with
 * `[]`, mirroring the Streamlit "No news items available" state.
 * @module api/routes/news
 */

import {
  ListNewsQuerySchema,
  type ListNewsQuery,
  type NewsItem,
} from "@chaintelescope/shared";
import type { Plugin } from "@hapi/hapi";
import { NewsRepo } from "../db/repos/news.js";

/**
 * Split a comma-separated watchlist, dropping blanks and duplicates.
 * Empty input means no filter (same as the Python endpoint's `None`).
 */
export function parseWatchlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((asset) => asset.trim())
        .filter((asset) => asset.length > 0),
    ),
  ];
}

export const newsPlugin: Plugin<void> = {
  name: "news",
  version: "0.0.0",
  register(server) {
    server.route({
      method: "GET",
      path: "/api/news",
      options: {
        tags: ["news"],
        validate: { query: ListNewsQuerySchema },
      },
      handler: async (request): Promise<NewsItem[]> => {
        const query = request.query as unknown as ListNewsQuery;
        const rows = await new NewsRepo(request.server.db).list({
          assets: parseWatchlist(query.watchlist),
          limit: query.limit,
        });
        return rows.map((row) => ({
          id: row.id,
          source: row.source,
          publishedAt: row.published_at.toISOString(),
          title: row.title,
          url: row.url,
          tags: [...row.tags],
        }));
      },
    });
  },
};
