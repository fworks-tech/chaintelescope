export type AssetSymbol = string;

export const HEALTH_PATH = "/healthz";

export interface HealthResponse {
  status: "ok";
}

export * from "./hash.js";
export * from "./canonical.js";
