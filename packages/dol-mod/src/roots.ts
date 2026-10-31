/**
 * 词根拆解：本地词根表 + 词典交叉验证。
 *
 * 设计原则是「宁可不拆，也不硬编」：
 * - 只在能给出有把握的组合时返回结果（前缀/后缀至少一个，或整词就是词根）；
 * - 能做 base 的必须是词典里真有的词（un + happy）；
 * - 拆不出就返回 null，UI 显示「无可靠词根」。
 */
import { ROOTS } from './generated/data.ts'
import type { RootPart } from './protocol.ts'
import { entryFor, shortGloss } from './dict.ts'
import { normalizeWord } from './lemmatize.ts'

interface Affix {
  part: string
  stem: string
  meaning: string
  examples: string[]
}

const PREFIXES: Affix[] = ROOTS.filter((r) => r.type === 'prefix')
  .map((r) => ({ part: r.part, stem: r.part.replace(/-$/, ''), meaning: r.meaning, examples: r.examples }))
  .sort((a, b) => b.stem.length - a.stem.length)

const SUFFIXES: Affix[] = ROOTS.filter((r) => r.type === 'suffix')
  .map((r) => ({ part: r.part, stem: r.part.replace(/^-/, ''), meaning: r.meaning, examples: r.examples }))
  .sort((a, b) => b.stem.length - a.stem.length)

const ROOT_ENTRIES = ROOTS.filter((r) => r.type === 'root')
  .map((r) => ({ part: r.part, meaning: r.meaning, examples: r.examples }))
  .sort((a, b) => b.part.length - a.part.length)

export interface RootAnalysis {
  parts: RootPart[]
  family: string[]
  confidence: 'high' | 'low'
}

interface Candidate {
  score: number
  parts: RootPart[]
  family: string[]
  confidence: 'high' | 'low'
}

export function analyzeRoots(raw: string): RootAnalysis | null {
  const word = normalizeWord(raw)
  if (word.length < 5 || !/^[a-z]+$/.test(word)) return null

  const best = bestCandidate(word)
  if (!best) return null
  return { parts: best.parts, family: best.family, confidence: best.confidence }
}

function bestCandidate(word: string): Candidate | null {
  const prefixes: Array<Affix | null> = [null, ...PREFIXES.filter((p) => word.startsWith(p.stem) && word.length - p.stem.length >= 3)]
  const suffixes: Array<Affix | null> = [null, ...SUFFIXES.filter((s) => word.endsWith(s.stem) && word.length - s.stem.length >= 3)]

  let best: Candidate | null = null
  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      if (!prefix && !suffix) continue
      const open = prefix ? prefix.stem.length : 0
      const close = suffix ? word.length - suffix.stem.length : word.length
      if (close - open < 3) continue
      const middle = word.slice(open, close)
      const candidate = scoreMiddle(word, prefix, suffix, middle)
      if (candidate && (!best || candidate.score > best.score)) best = candidate
    }
  }
  return best
}

function scoreMiddle(word: string, prefix: Affix | null, suffix: Affix | null, middle: string): Candidate | null {
  const head: RootPart[] = prefix ? [{ part: prefix.part, type: 'prefix', meaning: prefix.meaning }] : []
  const tail: RootPart[] = suffix ? [{ part: suffix.part, type: 'suffix', meaning: suffix.meaning }] : []
  const familyOf = (examples: string[]): string[] => examples.filter((w) => w !== word).slice(0, 4)

  // 1) 中间正好是一个词根：in + cred + ible
  const exactRoot = ROOT_ENTRIES.find((r) => r.part === middle)
  if (exactRoot && middle.length >= 3) {
    return {
      score: 20 + middle.length,
      parts: [...head, { part: exactRoot.part, type: 'root', meaning: exactRoot.meaning }, ...tail],
      family: familyOf(exactRoot.examples),
      confidence: 'high',
    }
  }

  // 2) 中间是能独立成词的词干：un + happy / quick + ly
  const baseEntry = middle.length >= 4 ? entryFor(middle) : null
  if (baseEntry) {
    return {
      score: 12 + middle.length,
      parts: [...head, { part: middle, type: 'base', meaning: shortGloss(baseEntry.gloss) }, ...tail],
      family: [],
      confidence: 'high',
    }
  }

  // 3) 词根是中间的一部分，且占大部分：允许词形变化带来的少量残余
  const inner = ROOT_ENTRIES.find((r) => middle.includes(r.part) && r.part.length / middle.length >= 0.7)
  if (inner) {
    return {
      score: 8 + inner.part.length,
      parts: [...head, { part: inner.part, type: 'root', meaning: inner.meaning }, ...tail],
      family: familyOf(inner.examples),
      confidence: 'low',
    }
  }

  return null
}
