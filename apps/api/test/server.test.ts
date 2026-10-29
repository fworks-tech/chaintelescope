import type { Server } from '@hapi/hapi'
import { afterEach, describe, expect, test } from 'vitest'
import { loadEnv } from '../src/env.js'
import { buildServer } from '../src/server.js'

const DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/hasheyes'
let server: Server | undefined

afterEach(async () => {
  await server?.stop({ timeout: 1_000 })
  server = undefined
})

describe('loadEnv', () => {
  test('fails fast on a missing required key without echoing other values', () => {
    expect(() => loadEnv({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL/)
    const message = (() => {
      try {
        loadEnv({ NODE_ENV: 'test' })
      } catch (error) {
        return (error as Error).message
      }
    })()
    expect(message).not.toContain('postgres://')
  })

  test('rejects a non-postgres DATABASE_URL', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/)
  })
})

describe('buildServer', () => {
  test('answers /healthz with 200', async () => {
    server = await buildServer(loadEnv({ DATABASE_URL, NODE_ENV: 'test' }))
    const res = await server.inject({ method: 'GET', url: '/healthz' })

    expect(res.statusCode).toBe(200)
    expect(res.result).toEqual({ status: 'ok' })
  })

  test('stop() drains an in-flight request instead of cutting it off', async () => {
    server = await buildServer(loadEnv({ DATABASE_URL, NODE_ENV: 'test', PORT: '0' }))
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.route({
      method: 'GET',
      path: '/slow',
      handler: async () => {
        await gate
        return { drained: true }
      },
    })
    await server.start()

    const inFlight = fetch(`${server.info.uri}/slow`)
    await new Promise((resolve) => setTimeout(resolve, 100))
    const stopping = server.stop({ timeout: 5_000 })
    release()

    const res = await inFlight
    await stopping

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ drained: true })
  })
})
