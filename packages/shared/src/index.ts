export type AssetSymbol = string;

export const HEALTH_PATH = "/healthz";

export interface HealthResponse {
  status: "ok";
}

export * from "./hash.js";
export * from "./canonical.js";
export * from "./validation.js";
export * from "./cursor.js";
