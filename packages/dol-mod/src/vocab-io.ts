/** 词库导入/导出：JSON 或 CSV → 生词条目。 */
import type { VocabBook, VocabEntry } from './vocab.ts'

export interface ImportedWord {
  word: string
  lemma?: string
  gloss: string
  phonetic?: string
  pos?: string
  sentence?: string
}

export interface ImportResult {
  added: number
  updated: number
  skipped: number
  entries: VocabEntry[]
}

export function parseVocabText(filename: string, text: string): ImportedWord[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const looksJson = filename.toLowerCase().endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{')
  return looksJson ? parseJson(trimmed) : parseCsv(trimmed)
}

function parseJson(text: string): ImportedWord[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  const list = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as { words?: unknown }).words)
      ? ((data as { words: unknown[] }).words)
      : []
  return normalize(list)
}

function parseCsv(text: string): ImportedWord[] {
  const rows = parseCsvRows(text)
  if (rows.length === 0) return []
  const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? []
  const hasHeader = header.includes('word') || header.includes('单词')
  const wordIdx = hasHeader ? indexOf(header, ['word', '单词']) : 0
  const glossIdx = hasHeader ? indexOf(header, ['gloss', 'definition', '释义']) : 1
  const body = hasHeader ? rows.slice(1) : rows
  const items: ImportedWord[] = []
  for (const row of body) {
    const word = (row[wordIdx] ?? '').trim()
    const gloss = (row[glossIdx] ?? '').trim()
    if (!word || !gloss) continue
    items.push({ word, gloss })
  }
  return items
}

function indexOf(header: string[], names: string[]): number {
  for (const name of names) {
    const i = header.indexOf(name)
    if (i >= 0) return i
  }
  return -1
}

/** 最小 CSV 解析：支持双引号包裹、字段内逗号与 "" 转义。 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

function normalize(list: unknown[]): ImportedWord[] {
  const out: ImportedWord[] = []
  for (const raw of list) {
    if (typeof raw !== 'object' || raw === null) continue
    const o = raw as Record<string, unknown>
    const word = str(o['word'] ?? o['term'])
    const gloss = str(o['gloss'] ?? o['definition'] ?? o['meaning'])
    if (!word || !gloss) continue
    out.push({
      word,
      gloss,
      ...(str(o['lemma']) ? { lemma: str(o['lemma']) } : {}),
      ...(str(o['phonetic']) ? { phonetic: str(o['phonetic']) } : {}),
      ...(str(o['pos']) ? { pos: str(o['pos']) } : {}),
      ...(str(o['sentence']) ? { sentence: str(o['sentence']) } : {}),
    })
  }
  return out
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 逐条写进生词本：已存在则更新释义，否则新增。 */
export function importVocab(book: VocabBook, items: ImportedWord[]): ImportResult {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, entries: [] }
  for (const item of items) {
    const lemma = (item.lemma ?? item.word).toLowerCase()
    if (!item.word || !item.gloss || !lemma) {
      result.skipped++
      continue
    }
    const existing = book.find(lemma)
    if (existing) {
      const updated = book.update(lemma, {
        gloss: item.gloss,
        ...(item.phonetic ? { phonetic: item.phonetic } : {}),
        ...(item.pos ? { pos: item.pos } : {}),
      })
      if (updated) {
        result.updated++
        result.entries.push(updated)
      } else {
        result.skipped++
      }
      continue
    }
    const { entry } = book.add({
      word: item.word,
      lemma,
      gloss: item.gloss,
      source: 'local',
      ...(item.phonetic ? { phonetic: item.phonetic } : {}),
      ...(item.pos ? { pos: item.pos } : {}),
      ...(item.sentence ? { sentence: item.sentence } : {}),
    })
    result.added++
    result.entries.push(entry)
  }
  return result
}
