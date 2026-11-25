/** Canonical news-source registry: edit here, then run `pnpm sync:news-sources`. */
export type NewsSourceRights = "approved" | "pending" | "denied";
export type NewsImageRights = "placeholder" | "hotlink-approved" | "denied";
export type NewsSourceAdapter =
  "rss" | "atom" | "federal-register" | "coingecko-news";

export interface NewsSourceDefinition {
  readonly key: string;
  readonly name: string;
  readonly homepageUrl: string;
  readonly feedUrl: string;
  readonly adapter: NewsSourceAdapter;
  readonly language: string;
  readonly enabled: boolean;
  readonly automationRights: NewsSourceRights;
  readonly metadataRights: NewsSourceRights;
  readonly imageRights: NewsImageRights;
  readonly termsUrl: string;
  readonly licenseUrl?: string;
  readonly reviewedAt: string;
  readonly reviewExpiresAt: string;
  readonly pollIntervalMinutes: number;
  readonly allowedImageHosts: readonly string[];
  readonly apiKeyEnv?: string;
}

const REVIEWED_AT = "2026-11-24";
const REVIEW_EXPIRES_AT = "2027-02-22";

export const NEWS_SOURCES: readonly NewsSourceDefinition[] = [
  {
    key: "sec",
    name: "U.S. Securities and Exchange Commission",
    homepageUrl: "https://www.sec.gov/",
    feedUrl: "https://www.sec.gov/news/pressreleases.rss",
    adapter: "rss",
    language: "en-US",
    enabled: true,
    automationRights: "approved",
    metadataRights: "approved",
    imageRights: "placeholder",
    termsUrl: "https://www.sec.gov/about/privacy-information#dissemination",
    reviewedAt: REVIEWED_AT,
    reviewExpiresAt: REVIEW_EXPIRES_AT,
    pollIntervalMinutes: 60,
    allowedImageHosts: [],
  },
  {
    key: "federal-register",
    name: "Federal Register",
    homepageUrl: "https://www.federalregister.gov/",
    feedUrl:
      "https://www.federalregister.gov/api/v1/documents.json?conditions%5Bterm%5D=cryptocurrency&order=newest&per_page=20",
    adapter: "federal-register",
    language: "en-US",
    enabled: false,
    automationRights: "approved",
    metadataRights: "approved",
    imageRights: "placeholder",
    termsUrl: "https://www.federalregister.gov/developers/documentation/api/v1",
    licenseUrl: "https://www.govinfo.gov/about/policies#copyright",
    reviewedAt: REVIEWED_AT,
    reviewExpiresAt: REVIEW_EXPIRES_AT,
    pollIntervalMinutes: 360,
    allowedImageHosts: [],
  },
  {
    key: "coingecko-news",
    name: "CoinGecko News",
    homepageUrl: "https://www.coingecko.com/",
    feedUrl: "https://pro-api.coingecko.com/api/v3/news",
    adapter: "coingecko-news",
    language: "en",
    enabled: false,
    automationRights: "approved",
    metadataRights: "approved",
    imageRights: "placeholder",
    termsUrl: "https://www.coingecko.com/en/api_terms",
    reviewedAt: REVIEWED_AT,
    reviewExpiresAt: REVIEW_EXPIRES_AT,
    pollIntervalMinutes: 1440,
    allowedImageHosts: [],
    apiKeyEnv: "COINGECKO_API_KEY",
  },
  {
    key: "cointelegraph",
    name: "Cointelegraph",
    homepageUrl: "https://cointelegraph.com/",
    feedUrl: "https://cointelegraph.com/rss",
    adapter: "rss",
    language: "en",
    enabled: false,
    automationRights: "denied",
    metadataRights: "denied",
    imageRights: "denied",
    termsUrl: "https://cointelegraph.com/terms-and-privacy",
    reviewedAt: REVIEWED_AT,
    reviewExpiresAt: REVIEW_EXPIRES_AT,
    pollIntervalMinutes: 60,
    allowedImageHosts: [],
  },
  {
    key: "coindesk",
    name: "CoinDesk",
    homepageUrl: "https://www.coindesk.com/",
    feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    adapter: "rss",
    language: "en-US",
    enabled: false,
    automationRights: "pending",
    metadataRights: "pending",
    imageRights: "placeholder",
    termsUrl: "https://www.coindesk.com/terms-of-use",
    reviewedAt: REVIEWED_AT,
    reviewExpiresAt: REVIEW_EXPIRES_AT,
    pollIntervalMinutes: 60,
    allowedImageHosts: [],
  },
  {
    key: "ethereum-foundation",
    name: "Ethereum Foundation Blog",
    homepageUrl: "https://blog.ethereum.org/",
    feedUrl: "https://blog.ethereum.org/en/feed.xml",
    adapter: "atom",
    language: "en",
    enabled: false,
    automationRights: "denied",
    metadataRights: "approved",
    imageRights: "placeholder",
    termsUrl: "https://ethereum.org/terms-of-use/",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    reviewedAt: REVIEWED_AT,
    reviewExpiresAt: REVIEW_EXPIRES_AT,
    pollIntervalMinutes: 60,
    allowedImageHosts: [],
  },
];

/** Feed URLs currently cleared for automated ingestion and public serving. */
export function approvedNewsSourceFeedUrls(
  now: Date = new Date(),
): readonly string[] {
  const today = now.toISOString().slice(0, 10);
  return NEWS_SOURCES.filter(
    (source) =>
      source.enabled &&
      source.automationRights === "approved" &&
      source.metadataRights === "approved" &&
      source.reviewedAt <= today &&
      today < source.reviewExpiresAt,
  ).map((source) => source.feedUrl);
}
