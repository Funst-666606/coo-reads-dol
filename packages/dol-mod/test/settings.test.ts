/** 模组设置：默认值、持久化、非法值回退、语速范围。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, clampRate, loadSettings, saveSettings } from '../src/settings.ts'
import { memoryKV } from '../src/store.ts'

test('空存储返回默认值', () => {
  assert.deepEqual(loadSettings(memoryKV()), DEFAULT_SETTINGS)
})

test('保存后可读回', () => {
  const kv = memoryKV()
  saveSettings(kv, { speak: false, rate: 1.1, wordCard: false, altSentence: true })
  assert.deepEqual(loadSettings(kv), { speak: false, rate: 1.1, wordCard: false, altSentence: true })
})

test('坏数据回退到默认值', () => {
  const kv = memoryKV({ 'settings.v1': '{not json' })
  assert.deepEqual(loadSettings(kv), DEFAULT_SETTINGS)

  const kv2 = memoryKV({ 'settings.v1': JSON.stringify({ speak: 'yes', rate: 99, wordCard: 1 }) })
  const loaded = loadSettings(kv2)
  assert.equal(loaded.speak, DEFAULT_SETTINGS.speak)
  assert.equal(loaded.wordCard, DEFAULT_SETTINGS.wordCard)
  assert.equal(loaded.rate, 1.3)
})

test('clampRate 限制在 0.6–1.3', () => {
  assert.equal(clampRate(0.1), 0.6)
  assert.equal(clampRate(2), 1.3)
  assert.equal(clampRate(0.955), 0.96)
  assert.equal(clampRate(Number.NaN), DEFAULT_SETTINGS.rate)
})
