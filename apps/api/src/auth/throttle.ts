/**
 * @fileoverview Janela deslizante de falhas de login, por e-mail e por IP.
 * @module api/auth/throttle
 */

export interface ThrottleOptions {
  /** Falhas toleradas dentro da janela (a próxima é bloqueada). */
  readonly maxAttempts?: number;
  readonly windowMs?: number;
  /** Relógio injetável; testes congelam o tempo com ele. */
  readonly now?: () => number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_KEYS = 10_000;

export class LoginThrottle {
  readonly #maxAttempts: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  // shortcut: estado em memória, um processo só; trocar por Redis quando a API
  // rodar em mais de uma instância.
  readonly #failures = new Map<string, number[]>();

  constructor(options: ThrottleOptions = {}) {
    this.#maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.#windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.#now = options.now ?? Date.now;
  }

  /**
   * @param {string} key - Normalmente `email` ou `ip`.
   * @returns {number} Segundos até liberar; `0` quando a tentativa é permitida.
   */
  retryAfterSeconds(key: string): number {
    const now = this.#now();
    const recent = (this.#failures.get(key) ?? []).filter(
      (at) => at > now - this.#windowMs,
    );

    if (recent.length === 0) {
      this.#failures.delete(key);
      return 0;
    }

    this.#failures.set(key, recent);
    if (recent.length < this.#maxAttempts) return 0;

    const oldest = recent[0] ?? now;
    return Math.max(1, Math.ceil((oldest + this.#windowMs - now) / 1000));
  }

  recordFailure(key: string): void {
    if (this.#failures.size >= MAX_TRACKED_KEYS) this.#prune();

    const recent = this.#failures.get(key) ?? [];
    recent.push(this.#now());
    this.#failures.set(key, recent);
  }

  reset(key: string): void {
    this.#failures.delete(key);
  }

  #prune(): void {
    const now = this.#now();
    for (const [key, attempts] of this.#failures) {
      if (attempts.every((at) => at <= now - this.#windowMs)) {
        this.#failures.delete(key);
      }
    }
  }
}
