/** World 配置段：worlds.dol.* */

import { SFW } from './variant.ts'

export type DolMode = 'proactive' | 'trigger' | 'passive'
export type DolAttitude = 'strict' | 'normal' | 'subtle' | 'erotic' | 'lewd'

export interface DolConfig {
  enabled: boolean
  /** false = 非学习模式：只陪玩，不查词/翻译/生词。 */
  learning: boolean
  /** 评论态度；erotic/lewd 需要 adult=true。 */
  attitude: DolAttitude
  /** 成人内容开关：关闭时 erotic/lewd 自动降为 subtle。 */
  adult: boolean
  /** 是否已完成首次「学英语 / 只想玩」选择。 */
  onboarded: boolean
  /** 引导版本：老配置缺这个字段时强制重问一次。 */
  onboardingVersion: number
  /** 本地端口；被占时向上顺延 9 个。 */
  port: number
  /** 默认模式。 */
  mode: DolMode
  /** 每天主动评论上限，0 = 不限。 */
  maxCommentsPerDay: number
  /** 发给 Coo 的场景正文上限（字符）。 */
  sceneTextLimit: number
  /** 等 Coo 回传讲解的超时（秒）。 */
  replyTimeoutSec: number
}

export const DOL_DEFAULTS: DolConfig = {
  enabled: false,
  learning: true,
  attitude: SFW ? 'strict' : 'normal',
  adult: false,
  onboarded: false,
  onboardingVersion: 1,
  port: 17321,
  mode: 'trigger',
  maxCommentsPerDay: 0,
  sceneTextLimit: 4000,
  replyTimeoutSec: 20,
}

export const ATTITUDES: readonly DolAttitude[] = ['strict', 'normal', 'subtle', 'erotic', 'lewd']

export const ATTITUDE_LABELS: Record<DolAttitude, string> = {
  strict: '严谨',
  normal: '正常',
  subtle: '含蓄',
  erotic: '色情',
  lewd: '淫乱',
}

/** 成人开关关闭时，把过火的档位降级。 */
export function effectiveAttitude(cfg: DolConfig): DolAttitude {
  if (SFW) return 'strict'
  if (!cfg.adult && (cfg.attitude === 'erotic' || cfg.attitude === 'lewd')) return 'subtle'
  return cfg.attitude
}

export const ATTITUDE_RULES: Record<DolAttitude, string> = {
  strict: '严谨：只陈述事实与语言信息，不调情、不性暗示、不主动扩展剧情；评论保持简短、克制。',
  normal: '正常：按 Coo 自己的性格说话，不额外规定语气；自然、像同伴。',
  subtle: '含蓄：可以点到为止地暧昧或打趣，但不露骨、不描写性行为；更多用留白和暗示。',
  erotic:
    '色情：允许明确的性描写与性暗示，围绕游戏内成年角色的场景发挥；仍然只评论游戏内容，不越出游戏。',
  lewd:
    '淫乱：允许更露骨、更粗俗、更主动的性描写与挑逗；仍然只评论游戏内成年角色的场景，不越出游戏。',
}
