import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MemoryCacheAdapter,
  RailwayCache,
  RailwayCacheDataError
} from '../model/cache.js'

test('cache serves hits and refreshes expired entries', async () => {
  let now = 1_000
  let loads = 0
  const cache = new RailwayCache({
    now: () => now,
    policies: { station: { ttlMs: 100, staleTtlMs: 200 } }
  })
  const load = async () => ({ sequence: ++loads })

  assert.deepEqual(await cache.remember('station', '上海', load), { sequence: 1 })
  assert.deepEqual(await cache.remember('station', '上海', load), { sequence: 1 })
  assert.equal(loads, 1)

  now += 101
  assert.deepEqual(await cache.remember('station', '上海', load), { sequence: 2 })
  assert.equal(loads, 2)
})

test('cache deduplicates concurrent upstream requests', async () => {
  let resolveLoad
  let loads = 0
  const cache = new RailwayCache({ policies: { trainDetail: { ttlMs: 100, staleTtlMs: 0 } } })
  const load = () => {
    loads += 1
    return new Promise((resolve) => { resolveLoad = resolve })
  }

  const first = cache.remember('trainDetail', 'G123:20260814', load)
  const second = cache.remember('trainDetail', 'G123:20260814', load)
  await new Promise((resolve) => setImmediate(resolve))
  resolveLoad({ trainCode: 'G123' })

  assert.deepEqual(await first, { trainCode: 'G123' })
  assert.deepEqual(await second, { trainCode: 'G123' })
  assert.equal(loads, 1)
})

test('cache returns a stale value when refresh fails inside the stale window', async () => {
  let now = 5_000
  const cache = new RailwayCache({
    now: () => now,
    policies: { route: { ttlMs: 100, staleTtlMs: 500 } }
  })
  await cache.remember('route', '京沪', async () => ({ name: '京沪高速铁路' }))

  now += 101
  const stale = await cache.remember('route', '京沪', async () => {
    throw new Error('upstream unavailable')
  })
  assert.deepEqual(stale, { name: '京沪高速铁路' })

  now += 501
  await assert.rejects(
    cache.remember('route', '京沪', async () => { throw new Error('still unavailable') }),
    /still unavailable/u
  )
})

test('cache rejects invalid fresh data and does not store it', async () => {
  const cache = new RailwayCache()
  await assert.rejects(
    cache.remember('station', 'invalid', async () => null, { validate: Array.isArray }),
    RailwayCacheDataError
  )
  assert.equal(await cache.adapter.get('station:invalid'), null)
})

test('cache adapter failures degrade to direct upstream loading', async () => {
  const adapter = new MemoryCacheAdapter()
  adapter.get = async () => { throw new Error('adapter get failed') }
  adapter.set = async () => { throw new Error('adapter set failed') }
  const cache = new RailwayCache({ adapter })
  assert.deepEqual(await cache.remember('station', '北京南', async () => ({ ok: true })), { ok: true })
})
