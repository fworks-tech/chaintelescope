/**
 * @fileoverview Repositório de assinaturas da newsletter.
 * @module api/db/repos/newsletter
 */

import type { Kysely, Selectable } from "kysely";
import type { DB, NewsletterSubscriptionsTable } from "../schema.js";

export type SubscriptionRow = Selectable<NewsletterSubscriptionsTable>;

export interface NewSubscription {
  readonly email: string;
  readonly frequency: NewsletterSubscriptionsTable["frequency"];
  readonly format: NewsletterSubscriptionsTable["format"];
}

export class NewsletterRepo {
  constructor(private readonly db: Kysely<DB>) {}

  /** @returns {Promise<SubscriptionRow | undefined>} `undefined` se já existe. */
  subscribe(input: NewSubscription): Promise<SubscriptionRow | undefined> {
    return this.db
      .insertInto("newsletter_subscriptions")
      .values({
        email: input.email,
        frequency: input.frequency,
        format: input.format,
      })
      .onConflict((oc) => oc.column("email").doNothing())
      .returningAll()
      .executeTakeFirst();
  }
}
