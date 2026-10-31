/** 查词、词根、间隔复习、生词本的纯逻辑测试（进程内，无浏览器）。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { lookup } from '../src/dict.ts'
import { lemmaCandidates, normalizeWord } from '../src/lemmatize.ts'
import { analyzeRoots } from '../src/roots.ts'
import { initialSrs, isDue, review } from '../src/srs.ts'
import { memoryKV } from '../src/store.ts'
import { VocabBook, formatRoots } from '../src/vocab.ts'

const DAY = 86_400_000

test('词形还原能命中常见变化', () => {
  assert.equal(lookup('running')?.lemma, 'run')
  assert.equal(lookup('studies')?.lemma, 'study')
  assert.equal(lookup('happier')?.lemma, 'happy')
  assert.equal(lookup('quickest')?.lemma, 'quick')
  assert.equal(lookup('walked')?.lemma, 'walk')
})

test('查不到的词返回 null', () => {
  assert.equal(lookup('qwertyuiop'), null)
  assert.equal(lookup(''), null)
})

test('归一化去掉标点与所有格', () => {
  assert.equal(normalizeWord('“Darkness,”'), 'darkness')
  assert.equal(normalizeWord("orphan's"), 'orphan')
  assert.equal(normalizeWord('—well—'), 'well')
})

test('lemmaCandidates 不产出原词与过短词', () => {
  const list = lemmaCandidates('running')
  assert.ok(!list.includes('running'))
  assert.ok(list.every((x) => x.length >= 2))
})

test('词根：in + cred + ible', () => {
  const r = analyzeRoots('incredible')
  assert.ok(r)
  assert.deepEqual(
    r.parts.map((p) => p.part),
    ['in-', 'cred', '-ible'],
  )
  assert.equal(r.parts[1]?.type, 'root')
  assert.ok(r.family.includes('credit'))
})

test('词根：前缀 + 词干', () => {
  const r = analyzeRoots('unhappy')
  assert.ok(r)
  assert.deepEqual(
    r.parts.map((p) => `${p.type}:${p.part}`),
    ['prefix:un-', 'base:happy'],
  )
})

test('词根：词干 + 后缀', () => {
  const r = analyzeRoots('quickly')
  assert.ok(r)
  assert.deepEqual(
    r.parts.map((p) => `${p.type}:${p.part}`),
    ['base:quick', 'suffix:-ly'],
  )
})

test('词根：trans + port', () => {
  const r = analyzeRoots('transport')
  assert.ok(r)
  assert.deepEqual(
    r.parts.map((p) => p.part),
    ['trans-', 'port'],
  )
})

test('词根：拆不出就返回 null，不硬编', () => {
  assert.equal(analyzeRoots('dog'), null)
  assert.equal(analyzeRoots('table'), null)
  assert.equal(analyzeRoots('zzzzzz'), null)
  assert.equal(analyzeRoots('the'), null)
})

test('词根格式化给 CSV', () => {
  const r = analyzeRoots('incredible')
  assert.ok(r)
  assert.match(formatRoots(r.parts), /in-\(前缀·不.*cred\(词根·相信\).*-ible\(后缀/)
})

test('间隔复习：答对升一级、答错回一级', () => {
  const t0 = 1_700_000_000_000
  const s0 = initialSrs(t0)
  assert.equal(s0.box, 0)
  assert.equal(isDue(s0, t0), false)
  assert.equal(isDue(s0, t0 + DAY + 1), true)

  const good = review(s0, 'good', t0)
  assert.equal(good.box, 1)
  assert.equal(good.dueAt, t0 + DAY)

  const again = review(good, 'again', t0)
  assert.equal(again.box, 0)
  assert.equal(again.dueAt, t0 + 10 * 60_000)
  assert.equal(again.lapses, 1)

  const hard = review(good, 'hard', t0)
  assert.equal(hard.box, 1)
  assert.ok(hard.dueAt > t0)
})

test('生词本：去重、更新最近出现、复习、到期筛选', () => {
  const kv = memoryKV()
  const book = new VocabBook(kv)
  const t0 = 1_700_000_000_000

  const first = book.add(
    { word: 'incredible', lemma: 'incredible', gloss: '难以置信的', source: 'local' },
    t0,
  )
  assert.equal(first.added, true)

  const second = book.add(
    { word: 'incredible', lemma: 'incredible', gloss: '难以置信的', sentence: 'It was incredible.', source: 'local' },
    t0 + 1000,
  )
  assert.equal(second.added, false)
  assert.equal(book.list().length, 1)
  assert.equal(book.list()[0]?.sentence, 'It was incredible.')
  assert.equal(book.list()[0]?.lastSeenAt, t0 + 1000)

  assert.equal(book.due(t0).length, 0)
  assert.equal(book.due(t0 + DAY + 1).length, 1)

  const graded = book.grade('incredible', 'good', t0 + DAY + 1)
  assert.ok(graded)
  assert.equal(graded.srs.box, 1)

  assert.equal(book.stats(t0 + DAY + 1).total, 1)
  assert.equal(book.remove('incredible'), true)
  assert.equal(book.list().length, 0)
})

test('导出 CSV 转义引号与逗号', () => {
  const book = new VocabBook(memoryKV())
  book.add(
    {
      word: 'say',
      lemma: 'say',
      gloss: '说，"讲"',
      sentence: 'He said, "go".',
      source: 'local',
    },
    1_700_000_000_000,
  )
  const csv = book.toCsv()
  assert.match(csv, /^"word","phonetic","pos","gloss","roots","sentence","addedAt","dueAt","box"/)
  assert.match(csv, /"说，""讲"""/)
  assert.match(csv, /"He said, ""go""\."/)
})
