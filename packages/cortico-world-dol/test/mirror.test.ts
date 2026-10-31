/** 生词镜像：持久化、统计、导出。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { VocabMirror } from '../src/mirror.ts'

const DIR = join(process.cwd(), '.cache', 'mirror-test')

test('镜像：增删、统计、持久化、导出', () => {
  rmSync(DIR, { recursive: true, force: true })
  mkdirSync(DIR, { recursive: true })
  const file = join(DIR, 'vocab.json')

  const mirror = new VocabMirror(file)
  mirror.load()
  const now = 1_700_000_000_000
  mirror.upsert({ word: 'incredible', lemma: 'incredible', gloss: '难以置信的', dueAt: now - 1, box: 1 }, now)
  mirror.upsert({ word: 'quickly', lemma: 'quickly', gloss: '迅速地', dueAt: now + 86_400_000, box: 0 }, now)
  mirror.save()

  assert.equal(mirror.stats(now).total, 2)
  assert.equal(mirror.stats(now).due, 1)
  assert.equal(mirror.due(now).length, 1)
  assert.equal(mirror.due(now)[0]?.lemma, 'incredible')

  const again = new VocabMirror(file)
  again.load()
  assert.equal(again.list().length, 2)
  assert.equal(again.list().find((e) => e.lemma === 'quickly')?.gloss, '迅速地')

  again.remove('incredible')
  assert.equal(again.stats(now).total, 1)

  const csv = again.toCsv()
  assert.match(csv, /^"word","phonetic","pos","gloss","dueAt","box"/)
  assert.match(csv, /"quickly"/)

  rmSync(DIR, { recursive: true, force: true })
})
