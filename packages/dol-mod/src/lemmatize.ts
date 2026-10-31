/**
 * 词形还原：只做「查得到才算数」的规则还原。
 * 目标不是语言学正确，而是让 running / studies / happier 能命中词典。
 */

const VOWEL = /[aeiouy]/

export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/^[^a-z]+|[^a-z']+$/g, '')
    .replace(/'s$/, '')
}

export function lemmaCandidates(word: string): string[] {
  const w = word.toLowerCase()
  const out: string[] = []
  const add = (s: string): void => {
    if (s.length >= 2 && s !== w && !out.includes(s)) out.push(s)
  }

  if (w.endsWith('ies') && w.length > 4) add(`${w.slice(0, -3)}y`)
  if (w.endsWith('ied') && w.length > 4) add(`${w.slice(0, -3)}y`)
  if (w.endsWith('ier') && w.length > 4) add(`${w.slice(0, -3)}y`)
  if (w.endsWith('iest') && w.length > 5) add(`${w.slice(0, -4)}y`)
  if (w.endsWith('ily') && w.length > 4) add(`${w.slice(0, -3)}y`)

  if (w.endsWith('es') && w.length > 3) {
    add(w.slice(0, -2))
    add(w.slice(0, -1))
  }
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) add(w.slice(0, -1))

  if (w.endsWith('ed') && w.length > 3) {
    add(w.slice(0, -2))
    add(w.slice(0, -1))
    const stem = w.slice(0, -2)
    if (stem.length > 3 && stem.at(-1) === stem.at(-2) && !VOWEL.test(stem.at(-1) ?? '')) add(stem.slice(0, -1))
  }

  if (w.endsWith('ing') && w.length > 4) {
    add(w.slice(0, -3))
    add(`${w.slice(0, -3)}e`)
    const stem = w.slice(0, -3)
    if (stem.length > 3 && stem.at(-1) === stem.at(-2) && !VOWEL.test(stem.at(-1) ?? '')) add(stem.slice(0, -1))
  }

  if (w.endsWith('er') && w.length > 3) {
    add(w.slice(0, -2))
    add(w.slice(0, -1))
  }
  if (w.endsWith('est') && w.length > 4) {
    add(w.slice(0, -3))
    add(w.slice(0, -2))
  }
  if (w.endsWith('ly') && w.length > 4) add(w.slice(0, -2))

  return out
}
