/** 汉化检测：以正文语言为主，插件名只认真正的汉化包。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { detectI18n, errorText, isMostlyChinese } from '../src/env.ts'

const ENGLISH = 'You wake up in a small bed. The room is dark, and the floorboards creak when you move.'
const CHINESE = '你在一张小床上醒来。房间里很暗，你一动，地板就吱呀作响。窗外的天还没亮。'

test('检测到真正的汉化模组即停用', () => {
  const msg = detectI18n({ modNames: ['TweeReplacer', 'ModI18N'], mainLanguage: 'en' })
  assert.ok(msg)
  assert.match(msg, /ModI18N/)
  assert.match(msg, /停用/)
})

test('通用翻译插件 I18nTweeReplacer 不算汉化（正文英文时放行）', () => {
  assert.equal(
    detectI18n({ modNames: ['I18nTweeReplacer'], mainLanguage: 'en', sampleText: ENGLISH }),
    null,
  )
})

test('中文包名与中文补丁名会被拦', () => {
  assert.ok(detectI18n({ modNames: ['汉化包'] }))
  assert.ok(detectI18n({ modNames: ['中文补丁'] }))
})

test('主语言不是 en 即停用', () => {
  const msg = detectI18n({ modNames: [], mainLanguage: 'zh' })
  assert.ok(msg)
  assert.match(msg, /zh/)
})

test('正文是中文即停用（即便没有汉化包名）', () => {
  const msg = detectI18n({ modNames: ['I18nTweeReplacer'], mainLanguage: 'en', sampleText: CHINESE })
  assert.ok(msg)
  assert.match(msg, /正文是中文/)
})

test('页面语言不是 en 即停用', () => {
  assert.ok(detectI18n({ documentLang: 'zh-CN' }))
})

test('英文环境放行', () => {
  assert.equal(detectI18n({ modNames: ['BetterUI'], mainLanguage: 'en', documentLang: 'en', sampleText: ENGLISH }), null)
  assert.equal(detectI18n({}), null)
})

test('isMostlyChinese 的边界', () => {
  assert.equal(isMostlyChinese(CHINESE), true)
  assert.equal(isMostlyChinese(ENGLISH), false)
  assert.equal(isMostlyChinese('short'), false)
  // 英文正文里出现几个汉字不该触发
  assert.equal(isMostlyChinese(`${ENGLISH} 张三 said hello.`), false)
  // 空串
  assert.equal(isMostlyChinese(''), false)
})

test('错误码翻成人话', () => {
  assert.match(errorText('timeout', ''), /重试/)
  assert.match(errorText('coo_unavailable', ''), /Coo 不在线/)
  assert.match(errorText('bad_hello', 'api 5 vs 6'), /版本不一致.*api 5 vs 6/)
  assert.equal(errorText('weird', 'x'), 'weird（x）')
})
