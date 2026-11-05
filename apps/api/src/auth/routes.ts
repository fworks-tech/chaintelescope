/**
 * @fileoverview Superfície HTTP de autenticação. O refresh token viaja em
 * cookie `HttpOnly` restrito a `/auth`; o access token volta no corpo.
 * @module api/auth/routes
 */

import {
  LoginPayloadSchema,
  RegisterPayloadSchema,
  type LoginPayload,
  type RegisterPayload,
} from "@chaintelescope/shared";
import { UnauthorizedError } from "../errors/index.js";
import type {
  Plugin,
  Request,
  ResponseToolkit,
  Server,
  ServerStateCookieOptions,
} from "@hapi/hapi";
import { AuthRepo } from "../db/repos/auth.js";
import { AuthSession } from "./session.js";
import { tokenStrategy } from "./strategy.js";

export const REFRESH_COOKIE = "refresh_token";
const DAY_MS = 86_400_000;

export interface AuthPluginOptions {
  readonly accessSecret: string;
  readonly accessTtl: string;
  readonly refreshTtlDays: number;
  readonly pepper: string;
  /** `Secure` só em produção: o dev server é HTTP. */
  readonly secureCookie: boolean;
}

function refreshTokenFrom(request: Request): string | undefined {
  const token = request.state[REFRESH_COOKIE];
  return typeof token === "string" ? token : undefined;
}

export const authPlugin: Plugin<AuthPluginOptions> = {
  name: "auth",
  version: "0.0.0",
  register(server: Server, options: AuthPluginOptions) {
    const session = new AuthSession(new AuthRepo(server.db), {
      pepper: Buffer.from(options.pepper, "hex"),
      accessSecret: options.accessSecret,
      accessTtl: options.accessTtl,
      refreshTtlDays: options.refreshTtlDays,
      log: (event, data) => server.log(["auth", "security", event], data),
    });

    const cookie = {
      isHttpOnly: true,
      isSecure: options.secureCookie,
      isSameSite: "Strict" as const,
      path: "/auth",
      ttl: options.refreshTtlDays * DAY_MS,
      encoding: "none" as const,
    };

    server.auth.scheme("token", tokenStrategy);
    server.auth.strategy("jwt", "token", { secret: options.accessSecret });

    server.route({
      method: "POST",
      path: "/auth/register",
      options: {
        auth: false,
        tags: ["auth"],
        validate: { payload: RegisterPayloadSchema },
      },
      handler: async (request, h) => {
        const { email, password } = request.payload as RegisterPayload;
        const user = await session.register({ email, password });
        return h.response(user).code(201);
      },
    });

    server.route({
      method: "POST",
      path: "/auth/login",
      options: {
        auth: false,
        tags: ["auth"],
        validate: { payload: LoginPayloadSchema },
      },
      handler: async (request, h) => {
        const { email, password } = request.payload as LoginPayload;
        const issued = await session.login({
          email,
          password,
          ip: request.info.remoteAddress,
        });
        return issue(h, issued, cookie);
      },
    });

    server.route({
      method: "POST",
      path: "/auth/refresh",
      options: { auth: false, tags: ["auth"] },
      handler: async (request, h) => {
        const issued = await session.refresh(refreshTokenFrom(request));
        return issue(h, issued, cookie);
      },
    });

    server.route({
      method: "POST",
      path: "/auth/logout",
      options: { auth: false, tags: ["auth"] },
      handler: async (request, h) => {
        await session.logout(refreshTokenFrom(request));
        return h
          .response()
          .code(204)
          .unstate(REFRESH_COOKIE, { path: "/auth" });
      },
    });

    server.route({
      method: "GET",
      path: "/auth/me",
      options: { auth: "jwt", tags: ["auth"] },
      handler: async (request) => {
        const credentials = request.auth.credentials as { user?: unknown };
        const user =
          typeof credentials.user === "string"
            ? await session.me(credentials.user)
            : undefined;

        if (user === undefined) {
          throw new UnauthorizedError(
            "invalid_token",
            "Invalid or expired token",
            "Bearer",
          );
        }
        return user;
      },
    });
  },
};

function issue(
  h: ResponseToolkit,
  issued: Awaited<ReturnType<AuthSession["login"]>>,
  cookie: ServerStateCookieOptions,
) {
  return h
    .response({
      accessToken: issued.accessToken,
      expiresIn: issued.expiresIn,
      user: issued.user,
    })
    .state(REFRESH_COOKIE, issued.refreshToken, cookie);
}
