/**
 * 生成 data/dict.json：从公开的四六级/托福词表抓取并解析成紧凑格式。
 *
 * 说明：
 * - 只保留「词 + 词性 + 中文」；音标与例句由 Coo 按需补。
 * - 产物不进版本库（.gitignore），因为它依赖第三方整理的词表；发布前要换成可再分发的源。
 * - 用法：node scripts/build-dict.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const outDir = join(root, '..', 'packages/dol-mod/data')

const SOURCES = [
  ['CET4_edited.txt', 'CET4'],
  ['CET6_edited.txt', 'CET6'],
  ['TOEFL.txt', 'TOEFL'],
]
const BASE = 'https://raw.githubusercontent.com/mahavivo/english-wordlists/master/'

const CJK = /[\u4e00-\u9fff]/
const POS_RE = /^([a-z]{1,6}\.)\s*/
const PHON_RE = /^\[([^\]]{1,60})\]\s*/

/** 一行拆成 [词, 音标, 词性, 释义]；拆不出返回 null。 */
export function parseLine(line) {
  const text = line.trim()
  if (!text || /^[A-Z]$/.test(text) || /^[（(]/.test(text)) return null
  if (!/^[A-Za-z]/.test(text)) return null

  // 词最多 4 个 token；从最左边开始试，取第一个「剩余部分含中文」的切法。
  const tokens = text.split(/\s+/)
  for (let n = 1; n <= Math.min(4, tokens.length - 1); n++) {
    const word = tokens.slice(0, n).join(' ')
    if (!/^[A-Za-z][A-Za-z'’\- ]*$/.test(word)) continue
    let rest = tokens.slice(n).join(' ')
    if (!CJK.test(rest)) continue

    let phonetic = ''
    const pm = rest.match(PHON_RE)
    if (pm) {
      phonetic = pm[1].trim()
      rest = rest.slice(pm[0].length)
    }
    let pos = ''
    const m = rest.match(POS_RE)
    if (m) {
      pos = m[1]
      rest = rest.slice(m[0].length)
    }
    rest = rest.replace(/\s+/g, ' ').trim()
    if (!rest || !CJK.test(rest)) continue
    return [word.toLowerCase(), phonetic, pos, rest]
  }
  return null
}

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return await res.text()
}

const words = {}
let parsed = 0
for (const [file, tag] of SOURCES) {
  const text = await fetchText(BASE + encodeURIComponent(file))
  let added = 0
  for (const line of text.split(/\r?\n/)) {
    const item = parseLine(line)
    if (!item) continue
    const [word, phonetic, pos, gloss] = item
    parsed++
    if (words[word]) continue
    words[word] = [phonetic, pos, gloss]
    added++
  }
  console.log(`${file}: +${added}`)
}

const payload = {
  v: 1,
  builtAt: new Date().toISOString().slice(0, 10),
  source: 'CET4/CET6/TOEFL lists (mahavivo/english-wordlists)',
  words,
}

await mkdir(outDir, { recursive: true })
const out = join(outDir, 'dict.json')
await writeFile(out, JSON.stringify(payload), 'utf8')
console.log(`wrote ${out}: ${Object.keys(words).length} words (parsed ${parsed} lines)`)
