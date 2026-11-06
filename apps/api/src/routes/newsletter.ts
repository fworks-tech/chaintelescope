/**
 * @fileoverview Assinatura da newsletter: 201 no create, 409 no duplicado,
 * 422 no e-mail inválido (o envelope vem do plugin de erros).
 * @module api/routes/newsletter
 */

import {
  NewsletterSubscriptionSchema,
  type NewsletterSubscriptionPayload,
} from "@chaintelescope/shared";
import type { Plugin, Server } from "@hapi/hapi";
import { NewsletterRepo } from "../db/repos/newsletter.js";
import { ConflictError } from "../errors/index.js";

export const newsletterPlugin: Plugin<void> = {
  name: "newsletter",
  version: "0.0.0",
  register(server: Server) {
    server.route({
      method: "POST",
      path: "/newsletter/subscribe",
      options: { validate: { payload: NewsletterSubscriptionSchema } },
      handler: async (request, h) => {
        const payload = request.payload as NewsletterSubscriptionPayload;
        const subscription = await new NewsletterRepo(
          request.server.db,
        ).subscribe(payload);

        if (subscription === undefined) {
          throw new ConflictError(
            "duplicate_subscription",
            "E-mail already subscribed",
          );
        }

        return h
          .response({
            id: subscription.id,
            email: subscription.email,
            frequency: subscription.frequency,
            format: subscription.format,
            createdAt: subscription.created_at.toISOString(),
          })
          .code(201);
      },
    });
  },
};
