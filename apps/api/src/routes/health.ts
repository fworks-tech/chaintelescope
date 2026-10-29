import { HEALTH_PATH, type HealthResponse } from '@hasheyes/shared'
import type { Plugin, Server } from '@hapi/hapi'

export const healthPlugin: Plugin<void> = {
  name: 'health',
  version: '0.0.0',
  register(server: Server) {
    server.route({
      method: 'GET',
      path: HEALTH_PATH,
      options: { tags: ['api'] },
      handler: (): HealthResponse => ({ status: 'ok' }),
    })
  },
}
