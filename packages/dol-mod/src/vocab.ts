/** 生词本：本地存储 + 间隔复习 + 导出。 */
import type { RootPart } from './protocol.ts'
import type { KV } from './store.ts'
import { initialSrs, isDue, review, type Grade, type SrsState } from './srs.ts'

export interface VocabInput {
  word: string
  lemma: string
  gloss: string
  phonetic?: string
  pos?: string
  roots?: RootPart[]
  family?: string[]
  sentence?: string
  passage?: string
  source: 'local' | 'coo'
}

export interface VocabEntry extends VocabInput {
  addedAt: number
  lastSeenAt: number
  srs: SrsState
  mastered?: boolean
}

const KEY = 'vocab.v1'

export class VocabBook {
  private readonly kv: KV

  constructor(kv: KV) {
    this.kv = kv
  }

  list(): VocabEntry[] {
    return this.load()
  }

  find(lemma: string): VocabEntry | null {
    const key = lemma.toLowerCase()
    return this.load().find((e) => e.lemma.toLowerCase() === key) ?? null
  }

  add(input: VocabInput, now = Date.now()): { entry: VocabEntry; added: boolean } {
    const list = this.load()
    const key = input.lemma.toLowerCase()
    const existing = list.find((e) => e.lemma.toLowerCase() === key)
    if (existing) {
      existing.lastSeenAt = now
      if (input.sentence) existing.sentence = input.sentence
      if (input.passage) existing.passage = input.passage
      if (!existing.phonetic && input.phonetic) existing.phonetic = input.phonetic
      if (!existing.roots && input.roots) existing.roots = input.roots
      this.save(list)
      return { entry: existing, added: false }
    }
    const entry: VocabEntry = {
      ...input,
      addedAt: now,
      lastSeenAt: now,
      srs: initialSrs(now),
    }
    list.push(entry)
    this.save(list)
    return { entry, added: true }
  }

  update(
    lemma: string,
    patch: {
      gloss?: string
      phonetic?: string
      pos?: string
      source?: 'local' | 'coo'
      roots?: RootPart[]
      family?: string[]
    },
    now = Date.now(),
  ): VocabEntry | null {
    const list = this.load()
    const entry = list.find((e) => e.lemma.toLowerCase() === lemma.toLowerCase())
    if (!entry) return null
    if (patch.gloss) entry.gloss = patch.gloss
    if (patch.phonetic) entry.phonetic = patch.phonetic
    if (patch.pos) entry.pos = patch.pos
    if (patch.source) entry.source = patch.source
    if (patch.roots) entry.roots = patch.roots
    if (patch.family) entry.family = patch.family
    entry.lastSeenAt = now
    this.save(list)
    return entry
  }

  remove(lemma: string): boolean {    const key = lemma.toLowerCase()
    const list = this.load()
    const next = list.filter((e) => e.lemma.toLowerCase() !== key)
    if (next.length === list.length) return false
    this.save(next)
    return true
  }

  touch(lemma: string, patch: { sentence?: string; passage?: string }, now = Date.now()): void {
    const list = this.load()
    const entry = list.find((e) => e.lemma.toLowerCase() === lemma.toLowerCase())
    if (!entry) return
    entry.lastSeenAt = now
    if (patch.sentence) entry.sentence = patch.sentence
    if (patch.passage) entry.passage = patch.passage
    this.save(list)
  }

  grade(lemma: string, grade: Grade, now = Date.now()): VocabEntry | null {
    const list = this.load()
    const entry = list.find((e) => e.lemma.toLowerCase() === lemma.toLowerCase())
    if (!entry) return null
    entry.srs = review(entry.srs, grade, now)
    entry.lastSeenAt = now
    this.save(list)
    return entry
  }

  setMastered(lemma: string, mastered: boolean): void {
    const list = this.load()
    const entry = list.find((e) => e.lemma.toLowerCase() === lemma.toLowerCase())
    if (!entry) return
    entry.mastered = mastered
    this.save(list)
  }

  due(now = Date.now()): VocabEntry[] {
    return this.load()
      .filter((e) => !e.mastered && isDue(e.srs, now))
      .sort((a, b) => a.srs.dueAt - b.srs.dueAt)
  }

  stats(now = Date.now()): { total: number; due: number; mastered: number } {
    const list = this.load()
    return {
      total: list.length,
      due: list.filter((e) => !e.mastered && isDue(e.srs, now)).length,
      mastered: list.filter((e) => e.mastered).length,
    }
  }

  toJson(): string {
    return JSON.stringify(this.load(), null, 2)
  }

  toCsv(): string {
    const header = ['word', 'phonetic', 'pos', 'gloss', 'roots', 'sentence', 'addedAt', 'dueAt', 'box']
    const rows = this.load().map((e) => [
      e.word,
      e.phonetic ?? '',
      e.pos ?? '',
      e.gloss,
      e.roots ? formatRoots(e.roots) : '',
      e.sentence ?? '',
      new Date(e.addedAt).toISOString(),
      new Date(e.srs.dueAt).toISOString(),
      String(e.srs.box),
    ])
    return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  }

  private load(): VocabEntry[] {
    let raw: string | null = null
    try {
      raw = this.kv.get(KEY)
    } catch {
      return []
    }
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isEntry)
    } catch {
      return []
    }
  }

  private save(list: VocabEntry[]): void {
    try {
      this.kv.set(KEY, JSON.stringify(list))
    } catch {
      /* 写不进去就只在内存里活着，UI 会提示导出 */
    }
  }
}

export function formatRoots(parts: RootPart[]): string {
  return parts.map((p) => `${p.part}(${typeLabel(p.type)}·${p.meaning})`).join(' + ')
}

function typeLabel(type: RootPart['type']): string {
  switch (type) {
    case 'prefix':
      return '前缀'
    case 'suffix':
      return '后缀'
    case 'base':
      return '词干'
    default:
      return '词根'
  }
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function isEntry(v: unknown): v is VocabEntry {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o['word'] === 'string' && typeof o['lemma'] === 'string' && typeof o['gloss'] === 'string'
}
