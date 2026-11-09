import test from 'node:test'
import assert from 'node:assert/strict'
import { HANZI_DATA } from '../src/hanzi-data.ts'
import { lookupHanzi } from '../src/hanzi.ts'

test('内置字库覆盖通用规范汉字表 8105 字', () => {
  assert.equal(Object.keys(HANZI_DATA).length, 8105)
})

test('定：拼音、注音、五笔、部首齐全', () => {
  const h = lookupHanzi('定')
  assert.ok(h)
  assert.equal(h.pinyin, 'dìng')
  assert.equal(h.zhuyin, 'ㄉㄧㄥˋ')
  assert.equal(h.wubi, 'PGHU')
  assert.equal(h.radical, '宀')
})

test('学：正体写法为 學', () => {
  assert.equal(lookupHanzi('学')?.traditional, '學')
})

test('生僻字也有数据（丏 / 夬）', () => {
  assert.ok(lookupHanzi('丏')?.pinyin)
  assert.ok(lookupHanzi('夬')?.wubi)
})

test('非汉字返回 null', () => {
  assert.equal(lookupHanzi('a'), null)
})
