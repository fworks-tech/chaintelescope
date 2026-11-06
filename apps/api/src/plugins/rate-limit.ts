/**
 * @fileoverview Rate limit por token bucket nas rotas caras (`/scans` e
 * `/auth/*`). Interface pronta para um backend Redis; a implementação é
 * em memória e por processo.
 * @module api/plugins/rate-limit
 */

import type { Plugin, Request, Server } from "@hapi/hapi";
import { TooManyRequestsError } from "../errors/index.js";

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Segundos até o próximo token; 0 quando permitido. */
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  tryConsume(key: string): Promise<RateLimitDecision>;
}

export interface BucketOptions {
  readonly capacity: number;
  /** Tokens repostos por segundo (capacidade / janela). */
  readonly refillPerSec: number;
}

interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

const MAX_TRACKED_KEYS = 10_000;

export class TokenBucketLimiter implements RateLimiter {
  readonly #buckets = new Map<string, Bucket>();
  readonly #now: () => number;

  constructor(
    private readonly options: BucketOptions,
    now: () => number = Date.now,
  ) {
    this.#now = now;
  }

  async tryConsume(key: string): Promise<RateLimitDecision> {
    if (this.#buckets.size >= MAX_TRACKED_KEYS) this.#prune();

    const now = this.#now();
    const current = this.#buckets.get(key) ?? {
      tokens: this.options.capacity,
      lastRefillAt: now,
    };

    const elapsedSec = Math.max(0, now - current.lastRefillAt) / 1_000;
    const tokens = Math.min(
      this.options.capacity,
      current.tokens + elapsedSec * this.options.refillPerSec,
    );

    if (tokens < 1) {
      this.#buckets.set(key, { tokens, lastRefillAt: now });
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((1 - tokens) / this.options.refillPerSec),
        ),
      };
    }

    this.#buckets.set(key, { tokens: tokens - 1, lastRefillAt: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  #prune(): void {
    const now = this.#now();
    for (const [key, bucket] of this.#buckets) {
      const refilled =
        bucket.tokens +
        ((now - bucket.lastRefillAt) / 1_000) * this.options.refillPerSec;
      if (refilled >= this.options.capacity) this.#buckets.delete(key);
    }
  }
}

export interface RateLimitRule {
  readonly prefix: string;
  readonly capacity: number;
  readonly refillPerSec: number;
}

const DEFAULT_RULES: readonly RateLimitRule[] = [
  // Upload e leitura de scans: 30/min.
  { prefix: "/scans", capacity: 30, refillPerSec: 30 / 60 },
  // Login é a rota mais cara (Argon2id); 5/min por IP.
  { prefix: "/auth/login", capacity: 5, refillPerSec: 5 / 60 },
  { prefix: "/auth", capacity: 10, refillPerSec: 10 / 60 },
];

const EXEMPT = new Set(["/healthz", "/readyz"]);

export interface RateLimitOptions {
  /** Desliga o limite (testes de outras rotas). */
  readonly enabled?: boolean;
  readonly now?: () => number;
  readonly rules?: readonly RateLimitRule[];
}

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function requestKey(request: Request): string {
  const credentials = request.auth.credentials as
    { user?: unknown } | null | undefined;
  return typeof credentials?.user === "string"
    ? `user:${credentials.user}`
    : `ip:${request.info.remoteAddress}`;
}

export function rateLimitPlugin(options: RateLimitOptions = {}): Plugin<void> {
  return {
    name: "rate-limit",
    version: "0.0.0",
    register(server: Server) {
      if (options.enabled === false) return;

      const rules = options.rules ?? DEFAULT_RULES;
      const limiters = rules.map(
        (rule) =>
          [
            rule,
            new TokenBucketLimiter(rule, options.now ?? Date.now),
          ] as const,
      );

      server.ext("onPreHandler", async (request, h) => {
        if (request.method === "options" || EXEMPT.has(request.path)) {
          return h.continue;
        }

        const matched = limiters.find(([rule]) =>
          matches(request.path, rule.prefix),
        );
        if (matched === undefined) return h.continue;

        const [rule, limiter] = matched;
        const decision = await limiter.tryConsume(requestKey(request));
        if (!decision.allowed) {
          throw new TooManyRequestsError(
            "rate_limited",
            "Too many requests",
            decision.retryAfterSeconds,
          );
        }

        return h.continue;
      });
    },
  };
}
