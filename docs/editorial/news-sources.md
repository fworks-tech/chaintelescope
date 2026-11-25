# News source inventory

Verified 2026-11-24. This is an operational rights review, not legal advice.
Technical availability never overrides publisher terms.

## Current registry

| Source              | Adapter      | Automatic                  | Metadata/link                                       | Image                              | Evidence                                                                                                                                    |
| ------------------- | ------------ | -------------------------- | --------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC                 | RSS          | Enabled                    | Approved with attribution                           | Placeholder                        | [SEC policy](https://www.sec.gov/about/privacy-information#dissemination)                                                                   |
| Federal Register    | Official API | Disabled until adapter     | Approved; third-party material may remain protected | Placeholder                        | [API docs](https://www.federalregister.gov/developers/documentation/api/v1), [GPO policy](https://www.govinfo.gov/about/policies#copyright) |
| CoinGecko News      | Paid API     | Disabled until adapter/key | Approved with “Powered by CoinGecko”                | Placeholder                        | [API terms](https://www.coingecko.com/en/api_terms)                                                                                         |
| Cointelegraph       | RSS          | Disabled                   | Denied without written permission                   | Denied                             | [Terms](https://cointelegraph.com/terms-and-privacy)                                                                                        |
| CoinDesk            | RSS          | Disabled                   | Pending review                                      | Placeholder                        | [Terms](https://www.coindesk.com/terms-of-use)                                                                                              |
| Ethereum Foundation | Atom         | Disabled                   | CC BY 4.0, but automation prohibited                | Placeholder pending per-item check | [Terms](https://ethereum.org/terms-of-use/)                                                                                                 |

## Rules

1. Edit `packages/shared/src/news-sources.ts`, never the generated JSON.
2. Record the exact terms/license URL and a review expiry no more than 90 days
   after review. Expiry is exclusive and evaluated in UTC: at 00:00 UTC on
   `reviewExpiresAt`, the source is no longer fetched or served.
3. Automation and metadata rights must both be `approved` before `enabled=true`.
4. `hotlink-approved` requires an explicit image grant and a non-empty host
   allowlist. A feed `media:content` URL alone is not a grant.
5. Do not use SEC seals, publisher logos, or branding that implies endorsement.
6. Respect source cadence, rate limits, attribution, and cache requirements.
7. Keep article bodies out of storage unless a separate license permits reuse.
8. Regenerate with `pnpm sync:news-sources`; CI fails if the artifact drifts.

## Adding a source

- [ ] Confirm the official feed/API endpoint and terms.
- [ ] Verify automated access is allowed, not merely technically possible.
- [ ] Verify metadata/link display and required attribution.
- [ ] Verify image rights separately; otherwise use `placeholder`.
- [ ] Add fixtures for the source's real field shapes.
- [ ] Set review dates and the minimum polling interval.
- [ ] Update this inventory and ADR-0011 in the same PR.

## Takedown

Set `enabled=false` (and `imageRights=denied` when applicable), regenerate the
artifact, deploy the API and Python job, and verify the source disappears from
ingestion. Purging existing rows is a separate, backed-up operator action; do
not delete data automatically.
