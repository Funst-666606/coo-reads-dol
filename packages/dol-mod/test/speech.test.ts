/** 朗读：嗓音挑选与 speak 调用（用假的 speechSynthesis，不依赖真实系统语音）。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { canSpeak, pickEnglishVoice, speakWord } from '../src/speech.ts'

function voice(lang: string, localService = true): SpeechSynthesisVoice {
  return {
    lang,
    localService,
    name: `${lang}-${localService ? 'local' : 'remote'}`,
    default: false,
    voiceURI: `${lang}-${localService}`,
  } as SpeechSynthesisVoice
}

class FakeUtterance {
  text: string
  lang = ''
  rate = 1
  voice: SpeechSynthesisVoice | null = null
  constructor(text: string) {
    this.text = text
  }
}

const globalBag = globalThis as unknown as Record<string, unknown>

test('pickEnglishVoice 优先本地、再 en-US', () => {
  const voices = [voice('fr-FR'), voice('en-GB'), voice('en-US', false), voice('en-US', true)]
  const picked = pickEnglishVoice(voices)
  assert.equal(picked?.lang, 'en-US')
  assert.equal(picked?.localService, true)
})

test('没有英文嗓音时返回 null', () => {
  assert.equal(pickEnglishVoice([voice('fr-FR'), voice('de-DE')]), null)
})

test('speakWord 会取消上一次、设置英文与嗓音', () => {
  const spoken: FakeUtterance[] = []
  let cancelled = 0
  const fake = {
    speak: (u: FakeUtterance) => spoken.push(u),
    cancel: () => {
      cancelled++
    },
    getVoices: () => [voice('en-GB')],
  }

  const saved = { s: globalBag['speechSynthesis'], u: globalBag['SpeechSynthesisUtterance'] }
  globalBag['speechSynthesis'] = fake
  globalBag['SpeechSynthesisUtterance'] = FakeUtterance
  try {
    assert.equal(canSpeak(), true)
    assert.equal(speakWord('incredible'), 'ok')
    assert.equal(cancelled, 1)
    assert.equal(spoken.length, 1)
    assert.equal(spoken[0]?.text, 'incredible')
    assert.equal(spoken[0]?.lang, 'en-GB')
    assert.equal(spoken[0]?.voice?.lang, 'en-GB')
    assert.ok((spoken[0]?.rate ?? 1) < 1)

    assert.equal(speakWord('   '), 'empty')
  } finally {
    globalBag['speechSynthesis'] = saved.s
    globalBag['SpeechSynthesisUtterance'] = saved.u
  }
})

test('不支持的环境返回 unsupported', () => {
  const saved = { s: globalBag['speechSynthesis'], u: globalBag['SpeechSynthesisUtterance'] }
  delete globalBag['speechSynthesis']
  delete globalBag['SpeechSynthesisUtterance']
  try {
    assert.equal(canSpeak(), false)
    assert.equal(speakWord('word'), 'unsupported')
  } finally {
    globalBag['speechSynthesis'] = saved.s
    globalBag['SpeechSynthesisUtterance'] = saved.u
  }
})
