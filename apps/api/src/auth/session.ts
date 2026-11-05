/**
 * @fileoverview Casos de uso de sessão: registro, login, rotação de refresh,
 * reuso detectado e logout. As rotas só traduzem HTTP.
 * @module api/auth/session
 */

import { randomUUID } from "node:crypto";
import {
  badRequest,
  conflict,
  tooManyRequests,
  unauthorized,
} from "@hapi/boom";
import { AuthRepo, type UserRow } from "../db/repos/auth.js";
import {
  hashPassword,
  needsUpgrade,
  verifyDummyPassword,
  verifyPassword,
} from "./password.js";
import { LoginThrottle } from "./throttle.js";
import {
  hashRefreshToken,
  newRefreshToken,
  signAccessToken,
} from "./tokens.js";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const DAY_MS = 86_400_000;

export interface PublicUser {
  readonly id: string;
  readonly email: string;
  readonly role: "user" | "admin";
}

export interface IssuedSession {
  readonly accessToken: string;
  readonly expiresIn: number;
  /** Em claro, para o cookie; o banco só guarda o sha256. */
  readonly refreshToken: string;
  readonly user: PublicUser;
}

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
}

export interface LoginInput extends RegisterInput {
  readonly ip: string;
}

export interface AuthSessionOptions {
  readonly pepper: Buffer;
  readonly accessSecret: string;
  readonly accessTtl: string;
  readonly refreshTtlDays: number;
  readonly throttle?: LoginThrottle;
  /** Eventos de segurança; a rota emite via `request.log`. */
  readonly log?: (event: string, data: Record<string, unknown>) => void;
  readonly now?: () => Date;
}

function publicUser(row: UserRow): PublicUser {
  return { id: row.id, email: row.email, role: row.role };
}

function scopeFor(role: UserRow["role"]): readonly string[] {
  return role === "admin" ? ["user", "admin"] : ["user"];
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class AuthSession {
  readonly #repo: AuthRepo;
  readonly #options: AuthSessionOptions;
  readonly #throttle: LoginThrottle;
  readonly #now: () => Date;
  readonly #log: (event: string, data: Record<string, unknown>) => void;

  constructor(repo: AuthRepo, options: AuthSessionOptions) {
    this.#repo = repo;
    this.#options = options;
    this.#throttle = options.throttle ?? new LoginThrottle();
    this.#now = options.now ?? (() => new Date());
    this.#log = options.log ?? (() => {});
  }

  async register(input: RegisterInput): Promise<PublicUser> {
    const email = normaliseEmail(input.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw badRequest("invalid_email");
    }
    this.#assertPasswordPolicy(input.password, email);

    const user = await this.#repo.createUser({
      email,
      passwordHash: await hashPassword(input.password, this.#options.pepper),
    });

    if (user === undefined) throw conflict("duplicate_email");
    return publicUser(user);
  }

  async login(input: LoginInput): Promise<IssuedSession> {
    const email = normaliseEmail(input.email);
    this.#assertNotThrottled(email, input.ip);

    const user = await this.#repo.userByEmail(email);
    const passwordMatches =
      user === undefined
        ? await verifyDummyPassword(input.password, this.#options.pepper)
        : await verifyPassword(
            user.password_hash,
            input.password,
            this.#options.pepper,
          );

    if (user === undefined || !passwordMatches) {
      this.#throttle.recordFailure(`email:${email}`);
      this.#throttle.recordFailure(`ip:${input.ip}`);
      throw unauthorized("invalid_credentials");
    }

    this.#throttle.reset(`email:${email}`);
    this.#throttle.reset(`ip:${input.ip}`);

    if (needsUpgrade(user.password_hash)) {
      await this.#repo.updatePasswordHash(
        user.id,
        await hashPassword(input.password, this.#options.pepper),
      );
    }

    return this.#issue(user, randomUUID());
  }

  async refresh(token: string | undefined): Promise<IssuedSession> {
    if (token === undefined || token.length === 0) {
      throw unauthorized("missing_refresh_token");
    }

    const next = newRefreshToken();
    const now = this.#now();
    const result = await this.#repo.rotateRefreshToken(
      hashRefreshToken(token),
      {
        tokenHash: next.hash,
        expiresAt: this.#refreshExpiry(now),
      },
      now,
    );

    if (result.kind === "reused") {
      this.#log("refresh_token_reuse", { familyId: result.familyId });
      throw unauthorized("refresh_token_reuse");
    }
    if (result.kind === "invalid") {
      throw unauthorized("invalid_refresh_token");
    }

    const user = await this.#repo.userById(result.userId);
    if (user === undefined) throw unauthorized("invalid_refresh_token");

    const access = signAccessToken(
      user.id,
      scopeFor(user.role),
      this.#options.accessSecret,
      this.#options.accessTtl,
    );

    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken: next.token,
      user: publicUser(user),
    };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token === undefined || token.length === 0) return;
    await this.#repo.revokeFamilyForToken(hashRefreshToken(token), this.#now());
  }

  async me(userId: string): Promise<PublicUser | undefined> {
    const row = await this.#repo.userById(userId);
    return row === undefined ? undefined : publicUser(row);
  }

  async #issue(user: UserRow, familyId: string): Promise<IssuedSession> {
    const now = this.#now();
    const refresh = newRefreshToken();
    await this.#repo.createRefreshToken({
      userId: user.id,
      familyId,
      tokenHash: refresh.hash,
      rotatedFrom: null,
      expiresAt: this.#refreshExpiry(now),
    });

    const access = signAccessToken(
      user.id,
      scopeFor(user.role),
      this.#options.accessSecret,
      this.#options.accessTtl,
    );

    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken: refresh.token,
      user: publicUser(user),
    };
  }

  #refreshExpiry(now: Date): Date {
    return new Date(now.getTime() + this.#options.refreshTtlDays * DAY_MS);
  }

  #assertNotThrottled(email: string, ip: string): void {
    const seconds = Math.max(
      this.#throttle.retryAfterSeconds(`email:${email}`),
      this.#throttle.retryAfterSeconds(`ip:${ip}`),
    );
    if (seconds === 0) return;

    const error = tooManyRequests("too_many_attempts");
    error.output.headers["retry-after"] = String(seconds);
    throw error;
  }

  #assertPasswordPolicy(password: string, email: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw badRequest("password_too_short");
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      throw badRequest("password_too_long");
    }
    if (password.toLowerCase() === email.split("@")[0]?.toLowerCase()) {
      throw badRequest("password_matches_email");
    }
  }
}
