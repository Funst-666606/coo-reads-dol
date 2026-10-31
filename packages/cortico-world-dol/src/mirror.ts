/** 生词镜像：游戏端发来的生词只读副本，给 World 面板统计与导出用。 */
import { readFileSync, writeFileSync } from 'node:fs'

export interface MirrorEntry {
  word: string
  lemma: string
  gloss: string
  phonetic?: string
  pos?: string
  dueAt?: number
  box?: number
  addedAt?: number
  mastered?: boolean
}

export class VocabMirror {
  private readonly file: string
  private entries = new Map<string, MirrorEntry>()

  constructor(file: string) {
    this.file = file
  }

  load(): void {
    try {
      const raw = readFileSync(this.file, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      for (const item of parsed) {
        if (typeof item === 'object' && item !== null) {
          const e = item as Record<string, unknown>
          const lemma = typeof e['lemma'] === 'string' ? e['lemma'] : ''
          if (!lemma) continue
          this.entries.set(lemma.toLowerCase(), {
            word: typeof e['word'] === 'string' ? e['word'] : lemma,
            lemma,
            gloss: typeof e['gloss'] === 'string' ? e['gloss'] : '',
            ...(typeof e['phonetic'] === 'string' ? { phonetic: e['phonetic'] } : {}),
            ...(typeof e['pos'] === 'string' ? { pos: e['pos'] } : {}),
            ...(typeof e['dueAt'] === 'number' ? { dueAt: e['dueAt'] } : {}),
            ...(typeof e['box'] === 'number' ? { box: e['box'] } : {}),
            ...(typeof e['addedAt'] === 'number' ? { addedAt: e['addedAt'] } : {}),
            ...(typeof e['mastered'] === 'boolean' ? { mastered: e['mastered'] } : {}),
          })
        }
      }
    } catch {
      /* 没有文件或坏了：从空开始 */
    }
  }

  upsert(entry: MirrorEntry, now = Date.now()): void {
    const key = entry.lemma.toLowerCase()
    const old = this.entries.get(key)
    this.entries.set(key, {
      ...old,
      ...entry,
      addedAt: old?.addedAt ?? entry.addedAt ?? now,
    })
  }

  remove(lemma: string): void {
    this.entries.delete(lemma.toLowerCase())
  }

  list(): MirrorEntry[] {
    return [...this.entries.values()].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
  }

  stats(now = Date.now()): { total: number; due: number } {
    const all = this.list()
    return { total: all.length, due: all.filter((e) => !e.mastered && (e.dueAt ?? 0) <= now).length }
  }

  /** 到期的词，最早到期在前。 */
  due(now = Date.now()): MirrorEntry[] {
    return this.list()
      .filter((e) => !e.mastered && (e.dueAt ?? 0) <= now)
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
  }

  toJson(): string {
    return JSON.stringify(this.list(), null, 2)
  }

  toCsv(): string {
    const header = ['word', 'phonetic', 'pos', 'gloss', 'dueAt', 'box', 'mastered']
    const rows = this.list().map((e) => [
      e.word,
      e.phonetic ?? '',
      e.pos ?? '',
      e.gloss,
      e.dueAt ? new Date(e.dueAt).toISOString() : '',
      e.box !== undefined ? String(e.box) : '',
      e.mastered ? 'yes' : '',
    ])
    return [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n')
  }

  save(): void {
    try {
      writeFileSync(this.file, JSON.stringify(this.list()), 'utf8')
    } catch {
      /* 写不进去不影响运行 */
    }
  }
}
