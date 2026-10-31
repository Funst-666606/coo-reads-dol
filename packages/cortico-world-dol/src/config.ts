/** World 配置段：worlds.dol.* */

export type DolMode = 'proactive' | 'trigger' | 'passive'

export interface DolConfig {
  enabled: boolean
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
  port: 17321,
  mode: 'trigger',
  maxCommentsPerDay: 0,
  sceneTextLimit: 4000,
  replyTimeoutSec: 20,
}
