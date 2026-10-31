/** Coo 改本地词库：add / remove / mastered 落到 VocabBook 上。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyVocabCommand } from '../src/vocab-commands.ts'
import { VocabBook } from '../src/vocab.ts'
import { memoryKV } from '../src/store.ts'

test('add：需要 word 与 gloss', () => {
  const book = new VocabBook(memoryKV())
  assert.equal(applyVocabCommand(book, { action: 'add', word: 'incredible' }), null)

  const result = applyVocabCommand(book, {
    action: 'add',
    word: 'incredible',
    gloss: '难以置信的',
    sentence: 'It was incredible.',
  })
  assert.ok(result)
  assert.equal(result.op, 'add')
  assert.equal(result.entry['lemma'], 'incredible')
  assert.equal(book.list().length, 1)
  assert.equal(book.list()[0]?.sentence, 'It was incredible.')
  assert.equal(book.list()[0]?.source, 'coo')
})

test('remove：删掉已有词；没有则返回 null', () => {
  const book = new VocabBook(memoryKV())
  book.add({ word: 'dark', lemma: 'dark', gloss: '黑暗的', source: 'local' })
  const result = applyVocabCommand(book, { action: 'remove', lemma: 'dark' })
  assert.equal(result?.op, 'remove')
  assert.equal(book.list().length, 0)
  assert.equal(applyVocabCommand(book, { action: 'remove', lemma: 'dark' }), null)
})

test('mastered：标记与取消掌握', () => {
  const book = new VocabBook(memoryKV())
  book.add({ word: 'dark', lemma: 'dark', gloss: '黑暗的', source: 'local' })

  const marked = applyVocabCommand(book, { action: 'mastered', lemma: 'dark', mastered: true })
  assert.equal(marked?.op, 'mastered')
  assert.equal(book.list()[0]?.mastered, true)

  applyVocabCommand(book, { action: 'mastered', lemma: 'dark', mastered: false })
  assert.equal(book.list()[0]?.mastered, false)
})
