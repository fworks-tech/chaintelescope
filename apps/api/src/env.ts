import Joi from 'joi'

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  HOST: Joi.string().default('0.0.0.0'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
})

export interface Env {
  NODE_ENV: 'development' | 'test' | 'production'
  HOST: string
  PORT: number
  DATABASE_URL: string
}

// Callers pass the source so tests can probe invalid shapes without touching process.env.
// Joi reports key names and constraint types only, never values.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const { value, error } = schema.validate(source, { abortEarly: false })
  if (error) throw new Error(`Invalid environment: ${error.message}`)
  return value as Env
}
