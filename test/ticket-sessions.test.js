import assert from 'node:assert/strict'
import test from 'node:test'

import { ScheduledTicketTaskManager, TicketPaginationStore } from '../model/ticket-sessions.js'

test('pagination sessions expire and advance only after a page is delivered', () => {
  let now = 1000
  const store = new TicketPaginationStore({ ttlMs: 300, now: () => now })
  const result = { records: Array(12).fill('record') }
  store.save('user', result)
  assert.equal(store.peek('user').nextPage, 2)
  store.advance('user', true)
  assert.equal(store.peek('user').nextPage, 3)
  now += 301
  assert.equal(store.peek('user'), null)
})

test('scheduled tasks run serially, stop on success and can be cancelled', async () => {
  const callbacks = []
  const cleared = []
  const manager = new ScheduledTicketTaskManager({
    setTimer: (callback) => { callbacks.push(callback); return callbacks.length },
    clearTimer: (timer) => cleared.push(timer),
    maxRuns: 9
  })
  const runs = []
  manager.start('user', {
    intervalMs: 60_000,
    run: async (count) => { runs.push(count); return false }
  })
  assert.equal(manager.has('user'), true)
  await callbacks[0]()
  assert.deepEqual(runs, [1])
  assert.equal(manager.has('user'), false)
  assert.deepEqual(cleared, [1])
})

test('scheduled tasks continue safely when both the query and error notification fail', async () => {
  const callbacks = []
  const manager = new ScheduledTicketTaskManager({
    setTimer: (callback) => { callbacks.push(callback); return callbacks.length },
    clearTimer: () => {},
    maxRuns: 2
  })
  manager.start('user', {
    intervalMs: 60_000,
    run: async () => { throw new Error('query failed') },
    onError: async () => { throw new Error('notification failed') }
  })
  await callbacks[0]()
  assert.equal(manager.has('user'), true)
  assert.equal(callbacks.length, 2)
  await callbacks[1]()
  assert.equal(manager.has('user'), false)
})
