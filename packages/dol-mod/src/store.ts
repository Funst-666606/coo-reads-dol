/** 存储抽象：游戏里用 localStorage，测试里用内存。所有读写都吞异常。 */

export interface KV {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export function memoryKV(seed: Record<string, string> = {}): KV {
  const data = new Map(Object.entries(seed))
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value)
    },
    remove: (key) => {
      data.delete(key)
    },
  }
}

/** localStorage 在 file:// 下可能抛 SecurityError；拿不到就退回内存。 */
export function localKV(prefix = 'cb.'): KV {
  try {
    const ls = globalThis.localStorage
    const probe = `${prefix}__probe`
    ls.setItem(probe, '1')
    ls.removeItem(probe)
    return {
      get: (key) => {
        try {
          return ls.getItem(prefix + key)
        } catch {
          return null
        }
      },
      set: (key, value) => {
        try {
          ls.setItem(prefix + key, value)
        } catch {
          /* 配额满或禁用：静默降级 */
        }
      },
      remove: (key) => {
        try {
          ls.removeItem(prefix + key)
        } catch {
          /* 忽略 */
        }
      },
    }
  } catch {
    return memoryKV()
  }
}
