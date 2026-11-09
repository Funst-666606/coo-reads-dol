/**
 * 单词朗读：用系统自带的 SpeechSynthesis（离线，不经过网络）。
 *
 * 只做「读一个词」：取消上一次、按学习目标选中文/英文嗓音。
 * 不支持的环境返回 'unsupported'，由 UI 提示，不抛错。
 */

export type SpeakResult = 'ok' | 'unsupported' | 'empty'

interface SpeechEngine {
  speak(utterance: SpeechSynthesisUtterance): void
  cancel(): void
  getVoices(): SpeechSynthesisVoice[]
}

interface SpeechGlobals {
  speechSynthesis?: SpeechEngine
  SpeechSynthesisUtterance?: new (text: string) => SpeechSynthesisUtterance
}

function engine(): SpeechEngine | null {
  const g = globalThis as unknown as SpeechGlobals
  return g.speechSynthesis && g.SpeechSynthesisUtterance ? g.speechSynthesis : null
}

export function canSpeak(): boolean {
  return engine() !== null
}

/** 优先本地嗓音、再 en-US / en-GB / 其它英文。 */
export function pickEnglishVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang))
  if (english.length === 0) return null

  const score = (v: SpeechSynthesisVoice): number => {
    let score = v.localService ? 0 : 10
    const lang = v.lang.toLowerCase()
    if (lang.startsWith('en-us')) score += 0
    else if (lang.startsWith('en-gb')) score += 1
    else score += 2
    return score
  }

  return [...english].sort((a, b) => score(a) - score(b))[0] ?? null
}

/** 中文嗓音：优先普通话、本地、zh-CN；没有就退回任意 zh。 */
export function pickChineseVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const chinese = voices.filter((v) => /^zh([-_]|$)/i.test(v.lang))
  if (chinese.length === 0) return null
  const score = (v: SpeechSynthesisVoice): number => {
    let score = v.localService ? 0 : 10
    const lang = v.lang.toLowerCase()
    if (lang.startsWith('zh-cn') || lang.startsWith('zh-hans')) score += 0
    else if (lang.startsWith('zh-tw') || lang.startsWith('zh-hant')) score += 1
    else score += 2
    return score
  }
  return [...chinese].sort((a, b) => score(a) - score(b))[0] ?? null
}

export function speakWord(text: string, opts: { rate?: number; lang?: 'en' | 'zh' } = {}): SpeakResult {
  const speech = engine()
  if (!speech) return 'unsupported'

  const word = text.trim()
  if (!word) return 'empty'

  try {
    speech.cancel()
  } catch {
    /* 有的实现会抛，忽略 */
  }

  const Utterance = (globalThis as unknown as SpeechGlobals).SpeechSynthesisUtterance
  if (!Utterance) return 'unsupported'

  const chinese = opts.lang === 'zh'
  const utterance = new Utterance(word)
  utterance.lang = chinese ? 'zh-CN' : 'en-US'
  utterance.rate = opts.rate ?? (chinese ? 0.85 : 0.95)
  utterance.pitch = 1
  const voice = chinese ? pickChineseVoice(speech.getVoices()) : pickEnglishVoice(speech.getVoices())
  if (voice) {
    utterance.voice = voice
    utterance.lang = voice.lang
  }

  try {
    speech.speak(utterance)
    return 'ok'
  } catch {
    return 'unsupported'
  }
}

export function stopSpeaking(): void {
  try {
    engine()?.cancel()
  } catch {
    /* 忽略 */
  }
}
