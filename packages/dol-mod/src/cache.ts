/** 翻译/讲解缓存：按请求 id 存，超出上限丢最旧的。 */
import type { KV } from './store.ts'

interface Entry<T> {
  value: T
  at: number
}

export class JsonCache<T> {
  private readonly kv: KV
  private readonly key: string
  private readonly limit: number

  constructor(kv: KV, key: string, limit = 500) {
    this.kv = kv
    this.key = key
    this.limit = limit
  }

  get(id: string): T | null {
    const all = this.load()
    return all[id]?.value ?? null
  }

  set(id: string, value: T): void {
    const all = this.load()
    all[id] = { value, at: Date.now() }
    const ids = Object.keys(all)
    if (ids.length > this.limit) {
      ids
        .sort((a, b) => (all[a]?.at ?? 0) - (all[b]?.at ?? 0))
        .slice(0, ids.length - this.limit)
        .forEach((old) => delete all[old])
    }
    this.save(all)
  }

  clear(): void {
    try {
      this.kv.remove(this.key)
    } catch {
      /* 忽略 */
    }
  }

  size(): number {
    return Object.keys(this.load()).length
  }

  private load(): Record<string, Entry<T>> {
    try {
      const raw = this.kv.get(this.key)
      if (!raw) return {}
      const parsed: unknown = JSON.parse(raw)
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, Entry<T>>) : {}
    } catch {
      return {}
    }
  }

  private save(all: Record<string, Entry<T>>): void {
    try {
      this.kv.set(this.key, JSON.stringify(all))
    } catch {
      /* 忽略 */
    }
  }
}
