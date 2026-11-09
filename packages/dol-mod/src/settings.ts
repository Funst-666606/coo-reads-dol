/** 模组设置：存 localStorage，读的时候做类型校验与范围限制。 */
import type { KV } from './store.ts'

export interface Settings {
  /** 单词卡是否显示朗读按钮。 */
  speak: boolean
  /** 朗读语速（0.6–1.3）。 */
  rate: number
  /** 点单词是否弹卡。 */
  wordCard: boolean
  /** Alt+点击 / 选中文本是否问句。 */
  altSentence: boolean
  /** World 端口；null = 17321。改完需重新载入游戏。 */
  port: number | null
  /** 学习语言模式；false = 只陪玩。 */
  learning: boolean
  /** 本地选择的界面语言；空 = 跟随 World 配置。 */
  uiLang?: string
  /** 本地选择的目标语言；空 = 跟随 World 配置。 */
  targetLang?: string
}

export const DEFAULT_SETTINGS: Settings = {
  speak: true,
  rate: 0.95,
  wordCard: true,
  altSentence: true,
  port: null,
  learning: true,
}

const KEY = 'settings.v1'

export function loadSettings(kv: KV): Settings {
  try {
    const raw = kv.get(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS }
    const o = parsed as Record<string, unknown>
    return {
      speak: typeof o['speak'] === 'boolean' ? o['speak'] : DEFAULT_SETTINGS.speak,
      rate: clampRate(typeof o['rate'] === 'number' ? o['rate'] : DEFAULT_SETTINGS.rate),
      wordCard: typeof o['wordCard'] === 'boolean' ? o['wordCard'] : DEFAULT_SETTINGS.wordCard,
      altSentence: typeof o['altSentence'] === 'boolean' ? o['altSentence'] : DEFAULT_SETTINGS.altSentence,
      port: validPort(o['port']),
      learning: typeof o['learning'] === 'boolean' ? o['learning'] : DEFAULT_SETTINGS.learning,
      ...(typeof o['uiLang'] === 'string' ? { uiLang: o['uiLang'] } : {}),
      ...(typeof o['targetLang'] === 'string' ? { targetLang: o['targetLang'] } : {}),
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(kv: KV, settings: Settings): void {
  try {
    kv.set(KEY, JSON.stringify(normalize(settings)))
  } catch {
    /* 写不进去就只在本次运行里生效 */
  }
}

export function normalize(settings: Settings): Settings {
  return {
    speak: settings.speak === true,
    rate: clampRate(settings.rate),
    wordCard: settings.wordCard === true,
    altSentence: settings.altSentence === true,
    port: validPort(settings.port),
    learning: settings.learning !== false,
    ...(settings.uiLang ? { uiLang: settings.uiLang } : {}),
    ...(settings.targetLang ? { targetLang: settings.targetLang } : {}),
  }
}

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_SETTINGS.rate
  return Math.min(1.3, Math.max(0.6, Math.round(rate * 100) / 100))
}

/** 端口只接受 1024–65535 的整数；其它一律回到默认（null）。 */
export function validPort(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  return value >= 1024 && value <= 65535 ? value : null
}
