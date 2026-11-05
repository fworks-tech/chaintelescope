/**
 * @fileoverview Repositório de autenticação: usuários e refresh tokens.
 * @module api/db/repos/auth
 */

import type { Kysely, Selectable } from "kysely";
import type { DB, RefreshTokensTable, UsersTable } from "../schema.js";
import { withTx } from "../tx.js";

export type UserRow = Selectable<UsersTable>;
export type RefreshTokenRow = Selectable<RefreshTokensTable>;

export interface NewUser {
  readonly email: string;
  readonly passwordHash: string;
  readonly role?: "user" | "admin";
}

export interface NewRefreshToken {
  readonly userId: string;
  readonly familyId: string;
  readonly tokenHash: string;
  readonly rotatedFrom: string | null;
  readonly expiresAt: Date;
}

export type RotateResult =
  | {
      readonly kind: "rotated";
      readonly userId: string;
      readonly familyId: string;
    }
  | { readonly kind: "reused"; readonly familyId: string }
  | { readonly kind: "invalid" };

export interface NextRefreshToken {
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export class AuthRepo {
  constructor(private readonly db: Kysely<DB>) {}

  /** @returns {Promise<UserRow | undefined>} `undefined` se o e-mail já existe. */
  createUser(input: NewUser): Promise<UserRow | undefined> {
    return this.db
      .insertInto("users")
      .values({
        email: input.email,
        password_hash: input.passwordHash,
        role: input.role ?? "user",
      })
      .onConflict((oc) => oc.column("email").doNothing())
      .returningAll()
      .executeTakeFirst();
  }

  userByEmail(email: string): Promise<UserRow | undefined> {
    return this.db
      .selectFrom("users")
      .selectAll()
      .where("email", "=", email)
      .executeTakeFirst();
  }

  userById(id: string): Promise<UserRow | undefined> {
    return this.db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.db
      .updateTable("users")
      .set({ password_hash: passwordHash })
      .where("id", "=", id)
      .execute();
  }

  async createRefreshToken(input: NewRefreshToken): Promise<string> {
    const row = await this.db
      .insertInto("refresh_tokens")
      .values({
        user_id: input.userId,
        family_id: input.familyId,
        token_hash: input.tokenHash,
        rotated_from: input.rotatedFrom,
        expires_at: input.expiresAt,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    return row.id;
  }

  /**
   * Rotação em uma transação: trava a linha atual, marca `rotated_at` e insere
   * a substituta na mesma família. Token já rotacionado significa reuso —
   * a família inteira é revogada.
   *
   * @param {string} currentHash - sha256 do token apresentado.
   * @param {NextRefreshToken} next - Token substituto, já com hash.
   * @param {Date} now - Instante da operação.
   * @returns {Promise<RotateResult>} Resultado discriminado.
   */
  rotateRefreshToken(
    currentHash: string,
    next: NextRefreshToken,
    now: Date,
  ): Promise<RotateResult> {
    return withTx(this.db, async (tx) => {
      const current = await tx
        .selectFrom("refresh_tokens")
        .selectAll()
        .where("token_hash", "=", currentHash)
        .forUpdate()
        .executeTakeFirst();

      if (current === undefined) return { kind: "invalid" };

      if (current.revoked_at !== null) return { kind: "invalid" };

      if (current.rotated_at !== null) {
        await tx
          .updateTable("refresh_tokens")
          .set({ revoked_at: now })
          .where("family_id", "=", current.family_id)
          .where("revoked_at", "is", null)
          .execute();
        return { kind: "reused", familyId: current.family_id };
      }

      if (current.expires_at.getTime() <= now.getTime()) {
        return { kind: "invalid" };
      }

      await tx
        .updateTable("refresh_tokens")
        .set({ rotated_at: now })
        .where("id", "=", current.id)
        .execute();

      await tx
        .insertInto("refresh_tokens")
        .values({
          user_id: current.user_id,
          family_id: current.family_id,
          token_hash: next.tokenHash,
          rotated_from: current.id,
          expires_at: next.expiresAt,
        })
        .execute();

      return {
        kind: "rotated",
        userId: current.user_id,
        familyId: current.family_id,
      };
    });
  }

  /** Revoga todos os membros da família do token, se ele existir. */
  async revokeFamilyForToken(tokenHash: string, now: Date): Promise<void> {
    const current = await this.db
      .selectFrom("refresh_tokens")
      .select("family_id")
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();

    if (current === undefined) return;

    await this.db
      .updateTable("refresh_tokens")
      .set({ revoked_at: now })
      .where("family_id", "=", current.family_id)
      .where("revoked_at", "is", null)
      .execute();
  }
}
