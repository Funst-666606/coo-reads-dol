/** 本地词典查询：精确 → 词形还原。 */
import { DICT } from './generated/data.ts'
import { lemmaCandidates, normalizeWord } from './lemmatize.ts'

export interface DictEntry {
  phonetic: string
  pos: string
  gloss: string
}

export interface LookupResult {
  /** 玩家点的原词（归一化后）。 */
  word: string
  /** 命中的词典原形。 */
  lemma: string
  entry: DictEntry
}

export function hasWord(word: string): boolean {
  return Object.hasOwn(DICT, word.toLowerCase())
}

export function lookup(raw: string): LookupResult | null {
  const word = normalizeWord(raw)
  if (!word) return null

  const direct = DICT[word]
  if (direct) return { word, lemma: word, entry: toEntry(direct) }

  for (const candidate of lemmaCandidates(word)) {
    const hit = DICT[candidate]
    if (hit) return { word, lemma: candidate, entry: toEntry(hit) }
  }
  return null
}

export function entryFor(lemma: string): DictEntry | null {
  const hit = DICT[lemma.toLowerCase()]
  return hit ? toEntry(hit) : null
}

function toEntry(tuple: readonly [string, string, string]): DictEntry {
  return { phonetic: tuple[0], pos: tuple[1], gloss: tuple[2] }
}

/** 释义太长时给词根块用：取第一段。 */
export function shortGloss(gloss: string, max = 14): string {
  const first = gloss.split(/[；;。]/)[0]?.trim() || gloss
  return first.length > max ? `${first.slice(0, max)}…` : first
}
