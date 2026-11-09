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
    if (cfg.sceneTextLimit !== 0 && cfg.sceneTextLimit < 200) {
      throw new Error('worlds.dol.sceneTextLimit 为 0（不限）或至少 200')
    }
    if (cfg.replyTimeoutSec < 5) throw new Error('worlds.dol.replyTimeoutSec 至少 5')
    const uiMap: Record<string, string> = {
      简体中文: 'zh-CN',
      正體中文: 'zh-TW',
      English: 'en',
      Русский: 'ru',
      日本語: 'ja',
    }
    if (uiMap[cfg.uiLang]) cfg.uiLang = uiMap[cfg.uiLang] as typeof cfg.uiLang
    if (!['zh-CN', 'zh-TW', 'en', 'ru', 'ja'].includes(cfg.uiLang)) {
      throw new Error('worlds.dol.uiLang 只能是 zh-CN / zh-TW / en / ru / ja')
    }
    const target = String(cfg.targetLang)
    if (target === '中文' || target === 'Chinese') cfg.targetLang = 'zh'
    if (target === '英语' || target === 'English') cfg.targetLang = 'en'
    if (!['en', 'zh'].includes(cfg.targetLang)) {
      throw new Error('worlds.dol.targetLang 只能是 en / zh')
    }
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
