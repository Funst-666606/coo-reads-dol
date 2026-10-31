/**
 * DoL World：把游戏里的场景与提问交给 Coo，把 Coo 的答复送回游戏。
 *
 * 它不决定 Coo 说什么、也不渲染游戏 UI：只保证事实准确、请求能对上号、失败有交代。
 */
import type { ToolDef, ToolOutcome, World, WorldHost, WorldWebUiDecl } from 'cortico/core/types.ts'
import type { Language } from 'cortico/core/language.ts'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { VocabMirror } from './mirror.ts'
import {
  ATTITUDE_LABELS,
  ATTITUDE_RULES,
  ATTITUDES,
  effectiveAttitude,
  type DolAttitude,
  type DolConfig,
  type DolMode,
} from './config.ts'
import {
  type ChoiceMsg,
  type RootPart,
  type SceneMsg,
  type SentenceMsg,
  type VocabCommand,
  type VocabMsg,
  type WordMsg,
  type WordPayload,
} from './protocol.ts'
import { DolServer } from './server.ts'
import { SFW } from './variant.ts'

const VERSION = '0.1.1'
const MODES: readonly DolMode[] = ['proactive', 'trigger', 'passive']

export interface DolWorldDeps {
  cfg: DolConfig
  dataDir: string
  timezone: string
  persist: (patch: Partial<DolConfig>) => void
}

export class DolWorld implements World {
  readonly id = 'dol'

  private host: WorldHost | null = null
  private server: DolServer | null = null

  private lastSceneKey = ''
  private lastScene: SceneMsg | null = null
  private lastConnEventAt = 0
  private commentDay = ''
  private commentsToday = 0
  private mirror: VocabMirror | null = null

  private readonly deps: DolWorldDeps

  constructor(deps: DolWorldDeps) {
    this.deps = deps
  }

  // ── 生命周期 ────────────────────────────────────────────────────────────

  async start(host: WorldHost): Promise<void> {
    this.host = host
    const cfg = this.deps.cfg
    // 老配置没有 onboardingVersion：强制重新问一次
    if ((cfg.onboardingVersion ?? 0) < 1) {
      cfg.onboarded = false
      cfg.onboardingVersion = 1
      this.deps.persist({ onboarded: false, onboardingVersion: 1 })
    }

    this.mirror = new VocabMirror(join(this.deps.dataDir, 'dol-vocab.json'))
    this.mirror.load()

    this.server = new DolServer({
      port: cfg.port,
      version: VERSION,
      replyTimeoutMs: Math.max(5, cfg.replyTimeoutSec) * 1000,
      log: host.log,
      onScene: (m) => this.onScene(m),
      onChoice: (m) => this.onChoice(m),
      onAsk: (m) => this.onAsk(m),
      onWordAsk: (m) => this.onWordAsk(m),
      onVocab: (m) => this.onVocab(m),
      onConnection: (connected) => this.onConnection(connected),
      onLearning: (learning) => {
        this.deps.cfg.learning = learning
        this.deps.persist({ learning, onboarded: true })
        this.pushConfig()
      },
    })
    await this.server.start()
    host.log.info('dol: World 已启动', { port: this.server.actualPort, mode: cfg.mode })
  }

  async stop(): Promise<void> {
    await this.server?.stop()
    this.server = null
    this.host = null
    this.lastScene = null
    this.lastSceneKey = ''
  }

  envPromptVars(): Record<string, string> {
    const cfg = this.deps.cfg
    const attitude = effectiveAttitude(cfg)
    return {
      mode: cfg.mode,
      connected: this.server?.connected ? 'yes' : 'no',
      port: String(this.server?.actualPort ?? cfg.port),
      learning: cfg.learning ? 'yes' : 'no',
      onboarded: cfg.onboarded ? 'yes' : 'no',
      variant_note: SFW
        ? '本版本是学习版：评论态度锁定「严谨」，不生成性内容；成人内容与开发者模式未开放。'
        : '完整版：成人内容与更多态度档位可在设置中开启。',
      attitude: ATTITUDE_LABELS[attitude],
      attitude_rule: ATTITUDE_RULES[attitude],
    }
  }

  webUi(language?: Language): WorldWebUiDecl {
    const zh = language !== 'en'
    const status = this.server?.status()
    return {
      label: zh ? '欲都孤鱼与多邻鱼' : 'Coo companion',
      lamps: [
        {
          label: zh ? '游戏连接' : 'Game link',
          state: status?.connected ? 'online' : 'offline',
          hint: `127.0.0.1:${status?.port ?? this.deps.cfg.port}`,
        },
      ],
      promptDocs: [
        {
          key: 'worlds.dol.env',
          title: zh ? '欲都孤鱼与多邻鱼环境提示' : 'DoL tutor environment',
          description: zh
            ? '告诉 Coo 怎么读 DoL 的事件、怎么回答查词与问句'
            : 'How Coo reads DoL events and answers lookups',
          path: fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url)),
          role: 'envPrompt',
        },
      ],
      panels: [
        {
          id: 'main',
          title: zh ? '陪读' : 'Tutor',
          description: zh ? '连接状态、模式、生词镜像与导出' : 'Link, mode, vocab mirror and export',
          getMethods: ['status', 'vocab'],
        },
      ],
      config: [
        {
          id: 'dol',
          owner: 'world:dol',
          schema: {
            type: 'object',
            title: zh ? '欲都孤鱼与多邻鱼' : 'Coo companion',
            description: zh
              ? '端口改动需要重启 World；其余立即生效。'
              : 'Port changes need a World restart; the rest apply immediately.',
            properties: {
              'worlds.dol.port': {
                type: 'integer',
                title: zh ? '本地端口' : 'Local port',
                description: zh
                  ? '游戏连 127.0.0.1 的这个端口；被占用时自动向上顺延 9 个。'
                  : 'The game connects to this 127.0.0.1 port; 9 ports above are tried if busy.',
                minimum: 1024,
                maximum: 65535,
                'x-hot': false,
              },
              'worlds.dol.enabled': {
                type: 'boolean',
                title: zh ? '启用陪玩' : 'Enabled',
                description: zh ? '总开关；关闭后不评论、不响应游戏事件。' : 'Master switch.',
                'x-hot': true,
              },
              'worlds.dol.learning': {
                type: 'boolean',
                title: zh ? '学习英语模式' : 'Learning mode',
                description: zh ? '关闭 = 只陪玩，不查词/翻译/生词。' : 'Off = companion only.',
                'x-hot': true,
              },
              'worlds.dol.attitude': {
                type: 'string',
                enum: ['strict', 'normal', 'subtle', 'erotic', 'lewd'],
                title: zh ? '评论态度' : 'Comment attitude',
                description: zh ? '严谨 / 正常 / 含蓄 / 色情 / 淫乱（后两档需开成人内容）' : 'strict / normal / subtle / erotic / lewd',
                'x-hot': true,
              },
              'worlds.dol.adult': {
                type: 'boolean',
                title: zh ? '成人内容' : 'Adult content',
                description: zh ? '开启后才可用「色情 / 淫乱」两档。' : 'Required for erotic/lewd.',
                'x-hot': true,
              },
              'worlds.dol.mode': {
                type: 'string',
                enum: ['proactive', 'trigger', 'passive'],
                title: zh ? '陪读模式' : 'Mode',
                description: zh
                  ? 'proactive 主动 / trigger 触发 / passive 被动'
                  : 'proactive / trigger / passive',
                'x-hot': true,
              },
              'worlds.dol.maxCommentsPerDay': {
                type: 'integer',
                title: zh ? '每日评论上限' : 'Comments per day',
                description: zh ? '0 = 不限' : '0 = unlimited',
                minimum: 0,
                maximum: 500,
                'x-hot': true,
              },
              'worlds.dol.sceneTextLimit': {
                type: 'integer',
                title: zh ? '场景文本上限' : 'Scene text limit',
                description: zh ? '发给 Coo 的正文字符数' : 'Characters sent to Coo',
                minimum: 200,
                maximum: 12000,
                'x-suffix': zh ? '字' : 'chars',
                'x-hot': true,
              },
              'worlds.dol.replyTimeoutSec': {
                type: 'integer',
                title: zh ? '讲解超时' : 'Reply timeout',
                description: zh ? '等 Coo 回传的最长秒数' : 'Seconds to wait for Coo',
                minimum: 5,
                maximum: 120,
                'x-suffix': 's',
                'x-hot': true,
              },
            },
          },
        },
      ],
      invoke: (panel, method, args) => this.invoke(panel, method, args),
    }
  }

  /** WebUI 面板的数据面。只读快照 + 模式切换 + 导出。 */
  async invoke(panel: string, method: string, args: unknown[]): Promise<unknown> {
    if (panel !== 'main') throw new Error(`未知面板 ${panel}`)
    switch (method) {
      case 'status':
        return this.statusSnapshot()
      case 'vocab':
        return this.mirror?.list() ?? []
      case 'setLearning': {
        const learning = args[0] === true
        this.deps.cfg.learning = learning
        this.deps.persist({ learning })
        this.pushConfig()
        return this.statusSnapshot()
      }
      case 'setAttitude': {
        if (SFW) return this.statusSnapshot()
        const attitude = typeof args[0] === 'string' ? args[0] : ''
        if (!ATTITUDES.includes(attitude as DolAttitude)) throw new Error(`未知态度 ${attitude}`)
        this.deps.cfg.attitude = attitude as DolAttitude
        this.deps.persist({ attitude: attitude as DolAttitude })
        this.pushConfig()
        return this.statusSnapshot()
      }
      case 'setAdult': {
        if (SFW) return this.statusSnapshot()
        const adult = args[0] === true
        this.deps.cfg.adult = adult
        this.deps.persist({ adult })
        this.pushConfig()
        return this.statusSnapshot()
      }
      case 'setEnabled': {
        const enabled = args[0] === true
        this.deps.cfg.enabled = enabled
        this.deps.persist({ enabled })
        this.pushConfig()
        return this.statusSnapshot()
      }
      case 'completeOnboarding': {
        const learning = args[0] === true
        this.deps.cfg.learning = learning
        this.deps.cfg.onboarded = true
        this.deps.persist({ learning, onboarded: true })
        this.pushConfig()
        return this.statusSnapshot()
      }
      case 'setMode': {
        const mode = typeof args[0] === 'string' ? args[0] : ''
        if (!MODES.includes(mode as DolMode)) throw new Error(`未知模式 ${mode}`)
        this.deps.cfg.mode = mode as DolMode
        this.deps.persist({ mode: mode as DolMode })
        return this.statusSnapshot()
      }
      case 'pushConfig':
        this.pushConfig()
        return this.statusSnapshot()
      case 'exportCsv':
        return this.mirror?.toCsv() ?? ''
      case 'exportJson':
        return this.mirror?.toJson() ?? '[]'
      default:
        throw new Error(`未知方法 ${method}`)
    }
  }

  private statusSnapshot(): Record<string, unknown> {
    const s = this.server?.status()
    const scene = this.lastScene
    return {
      connected: s?.connected ?? false,
      port: s?.port ?? this.deps.cfg.port,
      mode: this.deps.cfg.mode,
      passage: scene?.passage ?? null,
      day: scene?.state.day ?? null,
      location: scene?.state.location ?? null,
      enabled: this.deps.cfg.enabled,
      learning: this.deps.cfg.learning,
      attitude: this.deps.cfg.attitude,
      effectiveAttitude: effectiveAttitude(this.deps.cfg),
      sfw: SFW,
      adult: this.deps.cfg.adult,
      onboarded: this.deps.cfg.onboarded,
      todayComments: this.commentsToday,
      commentCap: this.deps.cfg.maxCommentsPerDay,
      vocab: this.mirror?.stats() ?? { total: 0, due: 0 },
    }
  }

  // ── 工具 ────────────────────────────────────────────────────────────────

  tools(): ToolDef[] {
    return DOL_TOOL_DECLS.map((decl) => ({ ...decl, handler: this.handlerFor(decl.name) }))
  }

  private handlerFor(name: string): ToolDef['handler'] {
    switch (name) {
      case 'dol_teach':
        return async (args) => this.handleTeach(args)
      case 'dol_define':
        return async (args) => this.handleDefine(args)
      case 'dol_now':
        return async () => this.describeNow()
      case 'dol_mode':
        return async (args) => this.handleMode(args)
      case 'dol_vocab':
        return async (args) => this.handleVocab(args)
      case 'dol_vocab_edit':
        return async (args) => this.handleVocabEdit(args)
      case 'dol_setup':
        return async (args) => this.handleSetup(args)
      default:
        throw new Error(`未知工具：${name}`)
    }
  }

  // ── 工具实现 ────────────────────────────────────────────────────────────

  private async handleTeach(args: Record<string, unknown>): Promise<string | ToolOutcome> {
    const id = str(args['id'])
    const translation = str(args['translation'])
    if (!id || !translation) return { text: '缺少 id 或 translation', failed: true }
    const notes = Array.isArray(args['notes'])
      ? (args['notes'] as unknown[]).map((x) => String(x)).filter(Boolean).slice(0, 3)
      : []
    const ok = this.server?.replySentence(id, { translation, notes }) ?? false
    return ok
      ? { text: `已送到游戏：id=${id}` }
      : { text: `找不到请求 ${id}（可能已超时），这条没有送到游戏`, failed: true }
  }

  private async handleDefine(args: Record<string, unknown>): Promise<string | ToolOutcome> {
    const id = str(args['id'])
    const lemma = str(args['lemma'])
    const gloss = str(args['gloss'])
    if (!id || !lemma || !gloss) return { text: '缺少 id / lemma / gloss', failed: true }

    const roots = Array.isArray(args['roots'])
      ? (args['roots'] as unknown[])
          .map((r): RootPart | null => {
            if (typeof r !== 'object' || r === null) return null
            const o = r as Record<string, unknown>
            const part = str(o['part'])
            const type = str(o['type'])
            const meaning = str(o['meaning'])
            if (!part || !meaning) return null
            if (type !== 'prefix' && type !== 'root' && type !== 'suffix' && type !== 'base') return null
            return { part, type, meaning }
          })
          .filter((r): r is RootPart => r !== null)
          .slice(0, 4)
      : []
    const family = Array.isArray(args['family'])
      ? (args['family'] as unknown[]).map((x) => String(x)).filter(Boolean).slice(0, 6)
      : []

    const payload: WordPayload = {
      lemma,
      gloss,
      source: 'coo',
      ...(str(args['phonetic']) ? { phonetic: str(args['phonetic']) } : {}),
      ...(str(args['pos']) ? { pos: str(args['pos']) } : {}),
      ...(roots.length > 0 ? { roots } : {}),
      ...(family.length > 0 ? { family } : {}),
    }
    const ok = this.server?.replyWord(id, payload) ?? false
    return ok
      ? { text: `已送到游戏：${lemma}（id=${id}）` }
      : { text: `找不到请求 ${id}（可能已超时），这条没有送到游戏`, failed: true }
  }

  private async handleMode(args: Record<string, unknown>): Promise<string> {
    const next = str(args['mode'])
    if (next && MODES.includes(next as DolMode)) {
      this.deps.cfg.mode = next as DolMode
      this.deps.persist({ mode: next as DolMode })
      return `陪读模式已切换为 ${next}`
    }
    if (next) return `不认识的模式 ${next}；可选 proactive / trigger / passive`
    const s = this.server?.status()
    return `当前模式 ${this.deps.cfg.mode}；连接 ${s?.connected ? '正常' : '未连接'}；端口 ${s?.port ?? this.deps.cfg.port}`
  }

  private async handleVocab(args: Record<string, unknown>): Promise<string> {
    const mirror = this.mirror
    if (!mirror) return '生词镜像还没加载。'

    const action = str(args['action']) || 'stats'
    const limit = Math.min(Math.max(Number(args['limit']) || 8, 1), 30)

    if (action === 'list') {
      const list = mirror.list().slice(0, limit)
      if (list.length === 0) return '生词本还是空的。'
      return `生词 ${mirror.stats().total} 个，最近加入：${list.map((e) => `${e.word}（${e.gloss}）`).join('、')}`
    }

    if (action === 'due') {
      const due = mirror.due().slice(0, limit)
      if (due.length === 0) return '今天没有到期的生词。'
      return `今天到期 ${mirror.stats().due} 个：${due.map((e) => e.word).join('、')}`
    }

    const stats = mirror.stats()
    return `生词 ${stats.total} 个，今天到期 ${stats.due} 个。`
  }

  private async handleVocabEdit(args: Record<string, unknown>): Promise<string | ToolOutcome> {
    const server = this.server
    if (!server?.connected) return { text: '游戏没连上，改不了本地词库', failed: true }

    const action = str(args['action'])
    if (action !== 'add' && action !== 'remove' && action !== 'mastered') {
      return { text: 'action 只能是 add / remove / mastered', failed: true }
    }

    const word = str(args['word'])
    const lemma = str(args['lemma']) || word
    const gloss = str(args['gloss'])
    if (action === 'add' && (!word || !gloss)) {
      return { text: 'add 需要 word 和 gloss（中文释义）', failed: true }
    }
    if (action !== 'add' && !lemma) {
      return { text: `${action} 需要 lemma 或 word`, failed: true }
    }

    const command: VocabCommand = {
      action,
      ...(word ? { word } : {}),
      ...(lemma ? { lemma } : {}),
      ...(gloss ? { gloss } : {}),
      ...(str(args['sentence']) ? { sentence: str(args['sentence']) } : {}),
      ...(typeof args['mastered'] === 'boolean' ? { mastered: args['mastered'] } : {}),
    }

    if (!server.sendCommand(command)) {
      return { text: '发送失败：游戏刚断开', failed: true }
    }

    const verb = action === 'add' ? '加入生词本' : action === 'remove' ? '从生词本移除' : '标记掌握'
    return { text: `已让游戏${verb}：${lemma || word}` }
  }

  private handleSetup(args: Record<string, unknown>): string {
    const learning = args['learning'] === true
    this.deps.cfg.learning = learning
    this.deps.cfg.onboarded = true
    this.deps.persist({ learning, onboarded: true })
    this.pushConfig()
    return learning ? '已设置为学习英语模式' : '已设置为只陪玩模式'
  }

  private describeNow(): string {
    const s = this.server?.status()
    if (!s?.connected) return '游戏现在没连上（玩家可能没开游戏，或没装模组）。'
    const scene = this.lastScene
    if (!scene) return `已连接（端口 ${s.port}），但还没收到场景。`
    const excerpt = scene.text.slice(0, 300)
    const choices = scene.choices.map((c) => `${c.index}. ${c.label}`).join(' / ')
    return `已连接（端口 ${s.port}）；第 ${scene.state.day ?? '?'} 天 ${scene.state.time ?? ''}，${scene.state.location ?? '未知地点'}。当前 passage：${scene.passage}。正文开头：${excerpt}${choices ? `。选项：${choices}` : ''}`
  }

  // ── 来自游戏的事件 ──────────────────────────────────────────────────────

  private pushConfig(): void {
    this.server?.sendConfig({
      type: 'config',
      enabled: this.deps.cfg.enabled,
      learning: this.deps.cfg.learning,
      attitude: effectiveAttitude(this.deps.cfg),
      adult: this.deps.cfg.adult,
    })
  }

  private onConnection(connected: boolean): void {
    if (connected) this.pushConfig()
    if (connected && !this.deps.cfg.onboarded) {
      void this.pushEvent({
        type: 'dol.onboarding',
        text: '第一次连上。请先问主人：想学英语，还是只想一起玩？收到回答后调用 dol_setup 设置（learning=true/false）。',
        trigger: 'piggyback',
      })
    }
    // 断线重连抖动时别刷屏：30 秒内只报一次连接状态变化。
    const now = Date.now()
    if (now - this.lastConnEventAt < 30_000) return
    this.lastConnEventAt = now
    void this.pushEvent({
      type: connected ? 'dol.connected' : 'dol.disconnected',
      text: connected ? '玩家打开了 DoL，模组已连上，可以陪他一起玩了。' : 'DoL 已断开（游戏关了，或模组停了）。',
      trigger: 'piggyback',
    })
  }

  private onScene(m: SceneMsg): void {
    this.lastScene = m
    const key = `${m.passage}|${m.seq}`
    this.lastSceneKey = key
    if (this.deps.cfg.mode === 'passive') return
    if (!this.allowComment()) return

    const where = [m.state.location, m.state.day ? `第 ${m.state.day} 天` : '', m.state.time]
      .filter(Boolean)
      .join(' ')
    const choices = m.choices.map((c) => `${c.index}. ${c.label}`).join(' / ')
    const text = `[DoL 场景] ${m.passage}${where ? `（${where}）` : ''}：${m.text}${choices ? `\n选项：${choices}` : ''}`
    void this.pushEvent({ type: 'dol.scene', text, meta: { passage: m.passage, seq: m.seq }, trigger: 'debounce' })
  }

  private onChoice(m: ChoiceMsg): void {
    if (this.deps.cfg.mode === 'passive') return
    if (!this.allowComment()) return
    void this.pushEvent({
      type: 'dol.choice',
      text: `[DoL 选择] 玩家选了第 ${m.index} 项：${m.label}`,
      meta: { index: m.index },
      trigger: 'debounce',
    })
  }

  private onAsk(m: SentenceMsg): void {
    const ctx = m.context ? `\n上下文：${m.context}` : ''
    void this.pushEvent({
      type: 'dol.ask',
      text:
        `[学句请求 id=${m.id}] 玩家点了这一句，等你翻译并讲解：\n“${m.text}”${ctx}\n` +
        `请调用 dol_teach（id 原样带上）回传中文翻译和 1–3 条讲解；只回传，不要在气泡里长篇解释。`,
      meta: { id: m.id },
      trigger: 'flush',
    })
  }

  private onWordAsk(m: WordMsg): void {
    void this.pushEvent({
      type: 'dol.word_ask',
      text:
        `[查词请求 id=${m.id}] 本地词典没收录 “${m.word}”，原句：“${m.sentence}”。\n` +
        `请调用 dol_define（id 原样带上）回传原形、释义、音标、词根与同根词；没把握的词根不要编。`,
      meta: { id: m.id, word: m.word },
      trigger: 'flush',
    })
  }

  private onVocab(m: VocabMsg): void {
    const entry = m.entry as Record<string, unknown>
    const lemma = str(entry['lemma']) || str(entry['word'])
    if (!lemma) return
    if (m.op === 'remove') {
      this.mirror?.remove(lemma)
    } else {
      this.mirror?.upsert({
        word: str(entry['word']) || lemma,
        lemma,
        gloss: str(entry['gloss']),
        ...(str(entry['phonetic']) ? { phonetic: str(entry['phonetic']) } : {}),
        ...(str(entry['pos']) ? { pos: str(entry['pos']) } : {}),
        ...(typeof entry['dueAt'] === 'number' ? { dueAt: entry['dueAt'] } : {}),
        ...(typeof entry['box'] === 'number' ? { box: entry['box'] } : {}),
        ...(typeof entry['addedAt'] === 'number' ? { addedAt: entry['addedAt'] } : {}),
        ...(typeof entry['mastered'] === 'boolean' ? { mastered: entry['mastered'] } : {}),
      })
    }
    this.mirror?.save()

    void this.pushEvent({
      type: 'dol.vocab',
      text: `[生词] 玩家${m.op === 'add' ? '加入' : m.op === 'remove' ? '移除' : '复习'}了 ${lemma}`,
      meta: { op: m.op, word: lemma },
      trigger: 'piggyback',
    })
  }

  // ── 内部 ────────────────────────────────────────────────────────────────

  private allowComment(): boolean {
    const cap = this.deps.cfg.maxCommentsPerDay
    if (cap <= 0) return true
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: this.deps.timezone })
    if (today !== this.commentDay) {
      this.commentDay = today
      this.commentsToday = 0
    }
    if (this.commentsToday >= cap) return false
    this.commentsToday += 1
    return true
  }

  private async pushEvent(input: {
    type: string
    text: string
    meta?: Record<string, unknown>
    trigger: 'flush' | 'debounce' | 'piggyback'
  }): Promise<void> {
    const host = this.host
    if (!host) return
    try {
      await host.pushEvent(
        {
          type: input.type,
          ts: new Date().toISOString(),
          source: this.id,
          origin: 'external',
          senderKey: this.id,
          text: input.text,
          ...(input.meta ? { meta: input.meta } : {}),
        },
        { trigger: input.trigger },
      )
    } catch (err) {
      host.log.warn(`dol: 推事件失败 ${String(err)}`)
    }
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** 全部工具声明（不含 handler）。自描述与 tools() 共用这一份，避免漂移。 */
export const DOL_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'dol_teach',
    description:
      '回答玩家在 DoL 里点选的句子：回传中文翻译与 1–3 条讲解。必须原样带上请求 id；回传后游戏里会显示卡片。',
    tags: ['write'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', description: '学句请求的 id，从 dol.ask 事件里取。' },
        translation: { type: 'string', description: '自然、准确的中文翻译。' },
        notes: {
          type: 'array',
          items: { type: 'string' },
          description: '1–3 条讲解：语法点、搭配、语气。可空。',
        },
      },
      required: ['id', 'translation'],
    },
  },
  {
    name: 'dol_define',
    description:
      '补全本地词典没收录的单词：释义、词根拆解、同根词。必须原样带上请求 id；没把握的词根不要编（省略即「无可靠词根」）。',
    tags: ['write'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', description: '查词请求的 id，从 dol.word_ask 事件里取。' },
        lemma: { type: 'string', description: '原形，如 running → run。' },
        gloss: { type: 'string', description: '简短中文释义，含词性。' },
        phonetic: { type: 'string', description: '音标，可空。' },
        pos: { type: 'string', description: '词性，如 n. / v. / adj.。' },
        roots: {
          type: 'array',
          description: '构词拆解；不确定就不要给。',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              part: { type: 'string' },
              type: { type: 'string', enum: ['prefix', 'root', 'suffix', 'base'] },
              meaning: { type: 'string' },
            },
            required: ['part', 'type', 'meaning'],
          },
        },
        family: { type: 'array', items: { type: 'string' }, description: '2–4 个同根词。' },
      },
      required: ['id', 'lemma', 'gloss'],
    },
  },
  {
    name: 'dol_now',
    description: '看玩家现在在 DoL 的哪一幕、连接是否正常、今天问了多少。想接一句游戏的话时用。',
    tags: ['read'],
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'dol_mode',
    description: '读取或切换陪读模式：proactive（主动）、trigger（触发）、passive（被动）。',
    tags: ['write'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: { type: 'string', enum: ['proactive', 'trigger', 'passive'], description: '不给则只读。' },
      },
      required: [],
    },
  },
  {
    name: 'dol_vocab',
    description:
      '查玩家的生词本镜像：stats=总数与到期数，list=最近加入，due=今天到期。想提醒复习、或聊到学习进度时用。',
    tags: ['read'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['stats', 'list', 'due'], description: '默认 stats。' },
        limit: { type: 'integer', description: '最多列几个，默认 8。' },
      },
      required: [],
    },
  },
  {
    name: 'dol_vocab_edit',
    description:
      '改玩家游戏内的生词本：add 需要 word + gloss；remove 用 lemma/word；mastered 标记是否掌握。只在玩家明确要求时用，别自作主张批量整理。',
    tags: ['write'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['add', 'remove', 'mastered'], description: '要做的事。' },
        word: { type: 'string', description: '单词原样，如 incredible。' },
        lemma: { type: 'string', description: '原形；不给就按 word。' },
        gloss: { type: 'string', description: 'add 必填：简短中文释义。' },
        sentence: { type: 'string', description: 'add 可选：出处原句。' },
        mastered: { type: 'boolean', description: 'mastered 用；默认 true。' },
      },
      required: ['action'],
    },
  },
  {
    name: 'dol_setup',
    description: '首次设置：Coo 问清玩家想学英语还是只想玩之后调用。learning=false 表示只陪玩。',
    tags: ['write'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        learning: { type: 'boolean', description: 'true = 学英语；false = 只陪玩' },
      },
      required: ['learning'],
    },
  },
]

/** 全部事件（自描述用）。trigger 与运行时 pushEvent 保持一致。 */
export const DOL_EVENTS = [
  { type: 'dol.onboarding', description: '首次连接，Coo 应主动问玩家：学英语还是只陪玩；然后用 dol_setup 设置', trigger: 'piggyback' },
  { type: 'dol.connected', description: '模组连上（玩家打开了游戏）', trigger: 'piggyback' },
  { type: 'dol.disconnected', description: '模组断开（游戏关了或模组停了）', trigger: 'piggyback' },
  { type: 'dol.scene', description: '切换场景：passage、正文、选项、地点/天数', trigger: 'debounce' },
  { type: 'dol.choice', description: '玩家点了一个选项', trigger: 'debounce' },
  { type: 'dol.ask', description: '玩家点了一句英文，请求翻译与讲解；需用 dol_teach 按 id 回传', trigger: 'flush' },
  { type: 'dol.word_ask', description: '本地词典未收录，请求补全；需用 dol_define 按 id 回传', trigger: 'flush' },
  { type: 'dol.vocab', description: '生词本增删或复习', trigger: 'piggyback' },
] as const
