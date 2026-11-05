/**
 * @fileoverview Validação e carregamento de variáveis de ambiente no ciclo de boot.
 * @module api/env
 */

import Joi from "joi";

/**
 * Contrato estrito das variáveis de ambiente exigidas pelo runtime da API.
 *
 * @interface Environment
 * @property {'development' | 'test' | 'production'} NODE_ENV - Ambiente de execução do Node.js.
 * @property {string} HOST - Hostname de escuta da interface de rede (ex.: '0.0.0.0').
 * @property {number} PORT - Porta TCP para o listener do servidor HTTP.
 * @property {string} DATABASE_URL - URI de conexão RFC com o banco de dados PostgreSQL.
 * @property {string} JWT_ACCESS_TTL - Janela de expiração temporal para tokens de acesso de curta duração (ex.: '15m').
 * @property {number} JWT_REFRESH_TTL_DAYS - Tempo de vida em dias para rotação segura de refresh tokens (1 a 30 dias).
 * @property {string} ARGON2_PEPPER - Chave secreta fixa de 64 caracteres hexadecimais para proteção contra ataques offline (OWASP).
 */
export interface Environment {
  readonly NODE_ENV: "development" | "test" | "production";
  readonly HOST: string;
  readonly PORT: number;
  readonly DATABASE_URL: string;
  readonly JWT_ACCESS_TTL: string;
  readonly JWT_REFRESH_TTL_DAYS: number;
  readonly ARGON2_PEPPER: string;
}

/**
 * Schema de validação formal do Joi com fail-fast no boot da aplicação.
 */
const envSchema = Joi.object<Environment>({
  NODE_ENV: Joi.string()
    .valid("development", "test", "production")
    .default("development"),
  HOST: Joi.string().hostname().default("0.0.0.0"),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgres", "postgresql"] })
    .required(),
  JWT_ACCESS_TTL: Joi.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().min(1).max(30).default(7),
  // Valida que o pepper criptográfico possui exatamente 64 caracteres hexadecimais (256 bits)
  ARGON2_PEPPER: Joi.string().hex().length(64).required(),
}).unknown(true);

/**
 * Valida e extrai variáveis de ambiente do processo.
 * Aplica o princípio fail-fast: lança erro fatal e interrompe a inicialização se qualquer variável violar o contrato.
 *
 * @param {NodeJS.ProcessEnv} [inputEnv=process.env] - Dicionário de variáveis de ambiente a serem validadas (permite injeção em testes).
 * @returns {Environment} Objeto de configuração estritamente tipado e imutável.
 * @throws {Error} Lança exceção fatal se o schema do Joi falhar na validação.
 *
 * @example
 * ```ts
 * const config = loadEnv();
 * console.log(`Iniciando servidor na porta ${config.PORT}`);
 * ```
 */
export function loadEnv(
  inputEnv: NodeJS.ProcessEnv = process.env,
): Environment {
  // abortEarly: false garante que todos os erros de validação sejam coletados de uma única vez
  const { value, error } = envSchema.validate(inputEnv, {
    abortEarly: false,
    stripUnknown: false,
  });

  if (error) {
    // Interrompe a execução antes de vincular portas ou abrir sockets de rede
    const errorDetails = error.details.map((d) => d.message).join(", ");
    throw new Error(
      `[FATAL] Configuration contract violation: ${errorDetails}`,
    );
  }

  return value as Environment;
}

/**
 * Instância singleton das configurações validadas para injeção direta em módulos da aplicação.
 */
export const env: Environment = loadEnv();
