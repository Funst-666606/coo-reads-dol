// ⚠️ 由 scripts/sync-protocol.mjs 生成，不要直接改。
// 单一事实来源：packages/protocol/src/index.ts

/**
 * DoL 陪读协议 v1：游戏内模组（浏览器）↔ Cortico World（Node）。
 *
 * 约定：
 * - 文本帧、JSON、UTF-8。
 * - 首帧必须是 hello；World 回 hello_ok 之后才收其它消息。
 * - 每个请求带 id，World 用同 id 回 reply（翻译请求由 Coo 调工具触发）。
 * - 本文件不依赖 DOM 与 Node，两端共用。
 */

export const PROTOCOL_VERSION = 1 as const

export type Mode = 'proactive' | 'trigger' | 'passive'

/** prefix/suffix 带连字符书写；root 是词根；base 是能独立成词的词干。 */
export type RootType = 'prefix' | 'root' | 'suffix' | 'base'

export interface RootPart {
  /** 原样片段，如 `in-`、`cred`、`-ible`。 */
  part: string
  type: RootType
  /** 中文含义，如「不」「相信」「可…的」。 */
  meaning: string
}

export interface GameInfo {
  /** 游戏版本，如 0.5.12.13。 */
  version: string
  /** 握手时所在 passage。 */
  passage: string
  /** 必须是 en；其它语言由模组自己先拦。 */
  lang: string
}

export interface ClientInfo {
  name: string
  version: string
}

export interface SceneState {
  location?: string
  day?: number
  time?: string
  money?: number
}

export interface Choice {
  index: number
  label: string
}

/** mod → World */
export interface HelloMsg {
  type: 'hello'
  protocol: number
  client: ClientInfo
  game: GameInfo
}

export interface SceneMsg {
  type: 'scene'
  seq: number
  passage: string
  title?: string
  text: string
  choices: Choice[]
  state: SceneState
  /** 游戏侧栏摘要：时间、钱、穿着、状态、提示。 */
  sidebar?: string
  /** 上一页 passage。 */
  previous?: string
  /** 与上一次场景相比的变化（压力/钱等）。 */
  delta?: string
}

/** 模组抓取的二级页面快照（特性/社交/特质/日志）。 */
export interface StatusMsg {
  type: 'status'
  /** 有值表示回应 World 的实时请求。 */
  id?: string
  day: number
  text: string
}

/** World 请求模组实时重读页面。 */
export interface StatusRequestMsg {
  type: 'status_request'
  id: string
}

export interface ChoiceMsg {
  type: 'choice'
  index: number
  label: string
}

export interface SentenceMsg {
  type: 'sentence'
  id: string
  text: string
  /** 前后各一句，帮助模型判断语气。 */
  context?: string
}

export interface WordMsg {
  type: 'word'
  id: string
  word: string
  sentence: string
}

export interface VocabMsg {
  type: 'vocab'
  op: 'add' | 'remove' | 'review' | 'mastered'
  entry: Record<string, unknown>
}

/** World 发给游戏的命令：目前只有改生词本。 */
export interface VocabCommand {
  action: 'add' | 'remove' | 'mastered'
  word?: string
  lemma?: string
  gloss?: string
  sentence?: string
  mastered?: boolean
}

export interface ConfigMsg {
  type: 'config'
  enabled: boolean
  learning: boolean
  attitude: string
  adult: boolean
  statusPageLimit?: number
  statusTotalLimit?: number
  uiLang?: string
  targetLang?: string
}

export interface LearningCommandMsg {
  type: 'command'
  command: 'learning'
  payload: { learning: boolean }
}

export interface ConfigSetMsg {
  type: 'config_set'
  uiLang?: string
  targetLang?: string
}

export interface CommandMsg {
  type: 'command'
  command: 'vocab' | 'learning'
  payload: VocabCommand
}

export interface PingMsg {
  type: 'ping'
}

export type ModMessage =
  | LearningCommandMsg
  | HelloMsg
  | StatusMsg
  | ConfigSetMsg
  | SceneMsg
  | ChoiceMsg
  | SentenceMsg
  | WordMsg
  | VocabMsg
  | PingMsg

/** World → mod */
export interface HelloOkMsg {
  type: 'hello_ok'
  protocol: number
  world: { version: string }
  features: string[]
}

export interface WordPayload {
  lemma: string
  phonetic?: string
  pos?: string
  gloss: string
  roots?: RootPart[]
  family?: string[]
  /** local = 本地词典；coo = Coo 补全；ai = Coo 明确写了「推测」。 */
  source: 'local' | 'coo' | 'ai'
  note?: string
}

export interface SentencePayload {
  translation: string
  notes: string[]
}

export interface ReplyMsg {
  type: 'reply'
  id: string
  kind: 'sentence' | 'word'
  ok: boolean
  payload?: SentencePayload | WordPayload
  error?: string
  source?: 'local' | 'coo' | 'ai'
}

export interface NoticeMsg {
  type: 'notice'
  level: 'info' | 'warn' | 'error'
  text: string
}

export interface ErrorMsg {
  type: 'error'
  code: 'bad_hello' | 'i18n_detected' | 'coo_unavailable' | 'timeout' | 'internal'
  message: string
}

export interface PongMsg {
  type: 'pong'
}

export type WorldMessage = HelloOkMsg | ReplyMsg | NoticeMsg | ErrorMsg | PongMsg | CommandMsg | ConfigMsg | StatusRequestMsg

// ── 解析 ──────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const MOD_TYPES = new Set<string>([
  'config_set',
  'hello',
  'scene',
  'choice',
  'sentence',
  'word',
  'vocab',
  'ping',
  'status',
  'command',
])

/** 只做形状级校验：type 合法、关键字段类型对。业务校验由接收方做。 */
export function decodeModMessage(raw: unknown): ModMessage | null {
  if (!isRecord(raw)) return null
  const type = raw['type']
  if (typeof type !== 'string' || !MOD_TYPES.has(type)) return null

  switch (type) {
    case 'hello': {
      const client = raw['client']
      const game = raw['game']
      if (typeof raw['protocol'] !== 'number') return null
      if (!isRecord(client) || typeof client['name'] !== 'string' || typeof client['version'] !== 'string') return null
      if (!isRecord(game) || typeof game['version'] !== 'string' || typeof game['passage'] !== 'string' || typeof game['lang'] !== 'string') return null
      return {
        type: 'hello',
        protocol: raw['protocol'],
        client: { name: client['name'], version: client['version'] },
        game: { version: game['version'], passage: game['passage'], lang: game['lang'] },
      }
    }
    case 'scene': {
      if (typeof raw['seq'] !== 'number' || typeof raw['passage'] !== 'string' || typeof raw['text'] !== 'string') return null
      const choices = Array.isArray(raw['choices']) ? raw['choices'] : []
      return {
        type: 'scene',
        seq: raw['seq'],
        passage: raw['passage'],
        text: raw['text'],
        choices: choices
          .filter((c): c is Record<string, unknown> => isRecord(c) && typeof c['index'] === 'number' && typeof c['label'] === 'string')
          .map((c) => ({ index: c['index'] as number, label: c['label'] as string })),
        state: isRecord(raw['state']) ? (raw['state'] as SceneState) : {},
        ...(typeof raw['title'] === 'string' ? { title: raw['title'] } : {}),
        ...(typeof raw['sidebar'] === 'string' ? { sidebar: raw['sidebar'] } : {}),
        ...(typeof raw['previous'] === 'string' ? { previous: raw['previous'] } : {}),
        ...(typeof raw['delta'] === 'string' ? { delta: raw['delta'] } : {}),
      }
    }
    case 'choice':
      if (typeof raw['index'] !== 'number' || typeof raw['label'] !== 'string') return null
      return { type: 'choice', index: raw['index'], label: raw['label'] }
    case 'sentence':
      if (typeof raw['id'] !== 'string' || typeof raw['text'] !== 'string') return null
      return {
        type: 'sentence',
        id: raw['id'],
        text: raw['text'],
        ...(typeof raw['context'] === 'string' ? { context: raw['context'] } : {}),
      }
    case 'word':
      if (typeof raw['id'] !== 'string' || typeof raw['word'] !== 'string' || typeof raw['sentence'] !== 'string') return null
      return { type: 'word', id: raw['id'], word: raw['word'], sentence: raw['sentence'] }
    case 'command': {
      if (raw['command'] !== 'learning') return null
      const payload = raw['payload']
      if (!isRecord(payload) || typeof payload['learning'] !== 'boolean') return null
      return { type: 'command', command: 'learning', payload: { learning: payload['learning'] } }
    }
    case 'config_set': {
      const out: Record<string, unknown> = { type: 'config_set' }
      if (typeof raw['uiLang'] === 'string') out['uiLang'] = raw['uiLang']
      if (typeof raw['targetLang'] === 'string') out['targetLang'] = raw['targetLang']
      return out as never
    }
    case 'status': {
      if (typeof raw['day'] !== 'number' || typeof raw['text'] !== 'string') return null
      return {
        type: 'status',
        day: raw['day'],
        text: raw['text'],
        ...(typeof raw['id'] === 'string' ? { id: raw['id'] } : {}),
      }
    }
    case 'vocab': {
      const op = raw['op']
      if (op !== 'add' && op !== 'remove' && op !== 'review' && op !== 'mastered') return null
      if (!isRecord(raw['entry'])) return null
      return { type: 'vocab', op, entry: raw['entry'] }
    }
    case 'ping':
      return { type: 'ping' }
    default:
      return null
  }
}

const WORLD_TYPES = new Set<string>(['hello_ok', 'reply', 'notice', 'error', 'pong', 'command', 'config', 'status_request'])

/** 接收方的形状校验：World 侧发来的消息。 */
export function decodeWorldMessage(raw: unknown): WorldMessage | null {
  if (!isRecord(raw)) return null
  const type = raw['type']
  if (typeof type !== 'string' || !WORLD_TYPES.has(type)) return null

  switch (type) {
    case 'hello_ok': {
      const world = raw['world']
      if (typeof raw['protocol'] !== 'number') return null
      if (!isRecord(world) || typeof world['version'] !== 'string') return null
      return {
        type: 'hello_ok',
        protocol: raw['protocol'],
        world: { version: world['version'] },
        features: Array.isArray(raw['features']) ? (raw['features'] as unknown[]).map(String) : [],
      }
    }
    case 'reply': {
      if (typeof raw['id'] !== 'string' || typeof raw['kind'] !== 'string') return null
      if (raw['kind'] !== 'sentence' && raw['kind'] !== 'word') return null
      if (typeof raw['ok'] !== 'boolean') return null
      const payload = raw['payload']
      return {
        type: 'reply',
        id: raw['id'],
        kind: raw['kind'],
        ok: raw['ok'],
        ...(isRecord(payload) ? { payload: payload as unknown as SentencePayload | WordPayload } : {}),
        ...(typeof raw['error'] === 'string' ? { error: raw['error'] } : {}),
      }
    }
    case 'notice': {
      const level = raw['level']
      if (level !== 'info' && level !== 'warn' && level !== 'error') return null
      if (typeof raw['text'] !== 'string') return null
      return { type: 'notice', level, text: raw['text'] }
    }
    case 'error': {
      const code = raw['code']
      if (typeof code !== 'string' || typeof raw['message'] !== 'string') return null
      return {
        type: 'error',
        code: code as ErrorMsg['code'],
        message: raw['message'],
      }
    }
    case 'pong':
      return { type: 'pong' }
    case 'status_request':
      return typeof raw['id'] === 'string' ? { type: 'status_request', id: raw['id'] } : null
    case 'config':
      if (typeof raw['enabled'] !== 'boolean' || typeof raw['learning'] !== 'boolean') return null
      return {
        type: 'config',
        enabled: raw['enabled'],
        learning: raw['learning'],
        attitude: typeof raw['attitude'] === 'string' ? raw['attitude'] : 'normal',
        adult: raw['adult'] === true,
        ...(typeof raw['statusPageLimit'] === 'number' ? { statusPageLimit: raw['statusPageLimit'] } : {}),
        ...(typeof raw['statusTotalLimit'] === 'number' ? { statusTotalLimit: raw['statusTotalLimit'] } : {}),
        ...(typeof raw['uiLang'] === 'string' ? { uiLang: raw['uiLang'] } : {}),
        ...(typeof raw['targetLang'] === 'string' ? { targetLang: raw['targetLang'] } : {}),
      }
    case 'command': {
      if (raw['command'] !== 'vocab' || !isRecord(raw['payload'])) return null
      const p = raw['payload']
      const action = p['action']
      if (action !== 'add' && action !== 'remove' && action !== 'mastered') return null
      return {
        type: 'command',
        command: 'vocab',
        payload: {
          action,
          ...(typeof p['word'] === 'string' ? { word: p['word'] } : {}),
          ...(typeof p['lemma'] === 'string' ? { lemma: p['lemma'] } : {}),
          ...(typeof p['gloss'] === 'string' ? { gloss: p['gloss'] } : {}),
          ...(typeof p['sentence'] === 'string' ? { sentence: p['sentence'] } : {}),
          ...(typeof p['mastered'] === 'boolean' ? { mastered: p['mastered'] } : {}),
        },
      }
    }
    default:
      return null
  }
}

export function encode(msg: WorldMessage | ModMessage): string {
  return JSON.stringify(msg)
}

/** 句子/单词请求的稳定 id：同句重试复用，保证缓存命中。 */
export function requestId(kind: 's' | 'w', text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${kind}${(h >>> 0).toString(36)}`
}
