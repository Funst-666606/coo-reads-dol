import type { WorldDefinition } from 'cortico/world.ts'
import { ATTITUDES, DOL_DEFAULTS, type DolConfig, type DolMode } from './config.ts'
import { describeTools } from './describe.ts'
import { DOL_EVENTS, DOL_TOOL_DECLS, DolWorld } from './world.ts'

const MODES: readonly DolMode[] = ['proactive', 'trigger', 'passive']

export const DOL: WorldDefinition<DolConfig> = {
  id: 'dol',
  label: '欲都孤鱼与多邻鱼',
  defaults: () => ({ ...DOL_DEFAULTS }),
  preflight: (ctx) => {
    const cfg = ctx.cfg
    if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) {
      throw new Error('worlds.dol.port 要是 1–65535 的整数')
    }
    if (!ATTITUDES.includes(cfg.attitude)) {
      throw new Error(`worlds.dol.attitude 只能是 ${ATTITUDES.join(' / ')}`)
    }
    if (!MODES.includes(cfg.mode)) {
      throw new Error(`worlds.dol.mode 只能是 ${MODES.join(' / ')}`)
    }
    if (cfg.sceneTextLimit < 200) throw new Error('worlds.dol.sceneTextLimit 至少 200')
    if (cfg.replyTimeoutSec < 5) throw new Error('worlds.dol.replyTimeoutSec 至少 5')
  },
  create: (ctx) =>
    new DolWorld({
      cfg: ctx.cfg,
      dataDir: ctx.dataDir,
      timezone: ctx.timezone,
      persist: (patch) => {
        ctx.persist(patch)
      },
    }),
  describe: {
    tools: describeTools(DOL_TOOL_DECLS, {
      dol_teach: '把中文翻译与讲解回传给游戏里的问句卡',
      dol_define: '补全本地词典没收录的单词（释义、词根、同根词）',
      dol_now: '当前场景、连接状态与今日统计',
      dol_mode: '读取或切换主动/触发/被动模式',
      dol_vocab: '生词本统计与今天到期的词',
    }),
    events: DOL_EVENTS,
  },
}
