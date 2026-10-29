import Hapi, { type Server } from '@hapi/hapi'
import hapiPino from 'hapi-pino'
import type { Env } from './env.js'
import { healthPlugin } from './routes/health.js'

export const STOP_TIMEOUT_MS = 10_000

export async function buildServer(env: Env): Promise<Server> {
  const server = Hapi.server({
    host: env.HOST,
    port: env.PORT,
    routes: {
      payload: { maxBytes: 64 * 1024 * 1024 },
      // failAction stays 'error' until M4 swaps in the Joi→Boom mapper.
      validate: { failAction: 'error' },
    },
  })

  await server.register({
    plugin: hapiPino,
    options: {
      enabled: env.NODE_ENV !== 'test',
      redact: ['req.headers.authorization', 'password'],
    },
  })

  await server.register([{ plugin: healthPlugin }])

  // Pool close is registered here so every shutdown path drains the same way (M3 owns the pool).
  server.ext('onPreStop', async () => {})

  return server
}
