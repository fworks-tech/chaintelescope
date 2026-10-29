import { loadEnv } from './env.js'
import { buildServer } from './server.js'

const server = await buildServer(loadEnv())

async function shutdown(signal: string): Promise<void> {
  server.log(['info'], `${signal} received, draining`)
  await server.stop({ timeout: 10_000 })
  process.exit(0)
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))

await server.start()
server.log(['info'], `listening on ${server.info.uri}`)
