import type { MarketProviderId, TimeWindow } from "./market.js";
import type { ScanKind, ScanStatus } from "./validation.js";

export interface ScanDto {
  readonly id: string;
  readonly kind: ScanKind;
  readonly status: ScanStatus;
  readonly assetSymbol: string | null;
  readonly contentHash: string | null;
  readonly failureReason: string | null;
  readonly durationMs: number | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export interface ScanListResponse {
  readonly items: readonly ScanDto[];
  readonly nextCursor: string | null;
}

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly role: "user" | "admin";
}

export interface AuthSessionResponse {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly user: AuthUser;
}

export interface NewsletterSubscription {
  readonly id: string;
  readonly email: string;
  readonly frequency: "Daily" | "Weekly" | "Biweekly";
  readonly format: "Summary" | "Deep Dive";
  readonly createdAt: string;
}

export interface DashboardKpi {
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly color: string;
}

export interface DashboardSnapshot {
  readonly timeWindow: TimeWindow;
  readonly watchlist: readonly string[];
  readonly trendFilter: string;
  readonly primaryAsset: string;
  readonly priceDates: readonly string[];
  readonly priceValues: readonly number[];
  readonly priceSource: MarketProviderId;
  readonly kpis: readonly DashboardKpi[];
  readonly riskScores: readonly number[];
  readonly riskLabels: readonly string[];
  readonly riskColors: readonly string[];
  readonly alerts: readonly string[];
  readonly news: readonly string[];
}
