const FIVE_MINUTES = 5 * 60_000

export class TicketPaginationStore {
  constructor({ ttlMs = FIVE_MINUTES, now = Date.now } = {}) {
    this.ttlMs = ttlMs
    this.now = now
    this.sessions = new Map()
  }

  save(key, result) {
    if (!key || !result?.records?.length) return
    this.sessions.set(key, { result, nextPage: 2, expiresAt: this.now() + this.ttlMs })
  }

  peek(key) {
    const session = this.sessions.get(key)
    if (!session) return null
    if (this.now() >= session.expiresAt) {
      this.sessions.delete(key)
      return null
    }
    return session
  }

  advance(key, hasNextPage) {
    const session = this.sessions.get(key)
    if (!session) return
    if (!hasNextPage) {
      this.sessions.delete(key)
      return
    }
    session.nextPage += 1
    session.expiresAt = this.now() + this.ttlMs
  }

  delete(key) {
    return this.sessions.delete(key)
  }

  clear() {
    this.sessions.clear()
  }
}

export class ScheduledTicketTaskManager {
  constructor({ setTimer = setTimeout, clearTimer = clearTimeout, maxRuns = 9 } = {}) {
    this.setTimer = setTimer
    this.clearTimer = clearTimer
    this.maxRuns = maxRuns
    this.tasks = new Map()
  }

  has(key) {
    return this.tasks.has(key)
  }

  start(key, { intervalMs, run, onError }) {
    this.cancel(key)
    const task = { timer: null, count: 0, stopped: false }
    const schedule = () => {
      if (task.stopped) return
      task.timer = this.setTimer(async () => {
        if (task.stopped) return
        task.count += 1
        try {
          const shouldContinue = await run(task.count, this.maxRuns)
          if (shouldContinue === false || task.count >= this.maxRuns) {
            this.cancel(key)
            return
          }
        } catch (error) {
          try {
            await onError?.(error, task.count, this.maxRuns)
          } catch {
            // A failed notification must not leave an unscheduled task in the registry.
          }
          if (task.count >= this.maxRuns) {
            this.cancel(key)
            return
          }
        }
        schedule()
      }, intervalMs)
      task.timer?.unref?.()
    }
    this.tasks.set(key, task)
    schedule()
  }

  cancel(key) {
    const task = this.tasks.get(key)
    if (!task) return false
    task.stopped = true
    if (task.timer != null) this.clearTimer(task.timer)
    this.tasks.delete(key)
    return true
  }

  clear() {
    for (const key of this.tasks.keys()) this.cancel(key)
  }
}

export const ticketPagination = new TicketPaginationStore()
export const scheduledTicketTasks = new ScheduledTicketTaskManager()
