import Joi from "joi";

export interface Environment {
  readonly NODE_ENV: "development" | "test" | "production";
  readonly HOST: string;
  readonly PORT: number;
  readonly DATABASE_URL: string;
  readonly JWT_ACCESS_TTL: string;
  readonly JWT_REFRESH_TTL_DAYS: number;
  readonly ARGON2_PEPPER: string;
}

const envSchema = Joi.object<Environment>({
  NODE_ENV: Joi.string()
    .valid("development", "test", "production")
    .default("development"),
  HOST: Joi.string().ip({ version: ["ipv4", "ipv6"] }).default("0.0.0.0"),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgres", "postgresql"] })
    .required(),
  JWT_ACCESS_TTL: Joi.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().min(1).max(30).default(7),
  ARGON2_PEPPER: Joi.string().hex().length(64).required(),
}).unknown(false);

export function loadEnv(
  inputEnv: NodeJS.ProcessEnv = process.env,
): Environment {
  const knownKeys = [
    "NODE_ENV",
    "HOST",
    "PORT",
    "DATABASE_URL",
    "JWT_ACCESS_TTL",
    "JWT_REFRESH_TTL_DAYS",
    "ARGON2_PEPPER",
  ];
  const filteredEnv = Object.fromEntries(
    knownKeys
      .filter((key) => inputEnv[key] !== undefined)
      .map((key) => [key, inputEnv[key]]),
  );
  const { value, error } = envSchema.validate(filteredEnv, {
    abortEarly: false,
    stripUnknown: false,
  });

  if (error) {
    const errorDetails = error.details.map((d) => d.message).join(", ");
    throw new Error(
      `[FATAL] Configuration contract violation: ${errorDetails}`,
    );
  }

  return value as Environment;
}

export const env: Environment = loadEnv();
