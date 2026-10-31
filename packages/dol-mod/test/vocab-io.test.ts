/** 词库导入：JSON / CSV 解析与合并。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { importVocab, parseCsvRows, parseVocabText } from '../src/vocab-io.ts'
import { VocabBook } from '../src/vocab.ts'
import { memoryKV } from '../src/store.ts'

test('JSON：数组与 {words:[]} 都认', () => {
  const arr = parseVocabText('words.json', JSON.stringify([{ word: 'dark', gloss: '黑暗的' }]))
  assert.equal(arr.length, 1)
  assert.equal(arr[0]?.word, 'dark')

  const boxed = parseVocabText('words.json', JSON.stringify({ words: [{ term: 'light', definition: '光' }] }))
  assert.equal(boxed.length, 1)
  assert.equal(boxed[0]?.gloss, '光')
})

test('CSV：表头、引号、字段内逗号', () => {
  const text = 'word,gloss\n"dark","黑暗的, 昏暗的"\nlight,光\n'
  const rows = parseCsvRows(text)
  assert.deepEqual(rows[0], ['word', 'gloss'])
  const items = parseVocabText('words.csv', text)
  assert.equal(items.length, 2)
  assert.equal(items[0]?.gloss, '黑暗的, 昏暗的')
  assert.equal(items[1]?.word, 'light')
})

test('CSV 没有表头时按前两列', () => {
  const items = parseVocabText('words.csv', 'dark,黑暗的\nlight,光\n')
  assert.equal(items.length, 2)
})

test('导入：新增、更新已有词、跳过无效行', () => {
  const book = new VocabBook(memoryKV())
  book.add({ word: 'dark', lemma: 'dark', gloss: '旧释义', source: 'local' })

  const result = importVocab(book, [
    { word: 'dark', gloss: '新释义' },
    { word: 'light', gloss: '光' },
    { word: '', gloss: '无效' },
  ])

  assert.equal(result.added, 1)
  assert.equal(result.updated, 1)
  assert.equal(result.skipped, 1)
  assert.equal(book.find('dark')?.gloss, '新释义')
  assert.equal(book.find('light')?.gloss, '光')
})
