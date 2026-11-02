/**
 * CooBridge：DoL 英文原版的陪读模组。
 *
 * 这个文件只做三件事：
 * 1. 确认环境（ModLoader 在、没装汉化），否则报错并完全停用；
 * 2. 把当前 passage 的正文/选项/状态送给 Coopanion 里的 DoL World；
 * 3. 维持连接、显示状态，并把 Coo 的答复留给后续的卡片 UI。
 *
 * 不碰存档、不改正文 DOM；所有失败都降级成「不可用」，不影响游戏。
 */
import { PROTOCOL_VERSION, decodeWorldMessage, encode, requestId, type ModMessage, type VocabCommand } from './protocol.ts'
import { readScene as readSceneFrom, resolvePassageRoot, type Scene } from './scene.ts'
import { pickGameVersion } from './version.ts'
import { detectI18n as detectI18nFrom, errorText } from './env.ts'
import { Ui } from './ui.ts'
import { VocabBook } from './vocab.ts'
import { captureStatusPages } from './pages.ts'
import { JsonCache } from './cache.ts'
import { localKV } from './store.ts'
import { loadSettings, saveSettings } from './settings.ts'
import { applyVocabCommand } from './vocab-commands.ts'

const TAG = '[CooBridge]'
const CLIENT_VERSION = '0.1.26'
const SUPPORTED_GAME = '0.5.12.13'
const PORT_BASE = 17321
const PORT_COUNT = 10

/** 端口来自设置里的「端口」（默认 17321）；测试可用 __coobridgePort 覆盖。改端口后需重新载入游戏。 */
function readPortBase(setting: number | null): number {
  const forced = (globalThis as unknown as { __coobridgePort?: unknown }).__coobridgePort
  if (typeof forced === 'number' && Number.isInteger(forced) && forced > 0 && forced < 65536) return forced
  return setting ?? PORT_BASE
}

declare global {
  interface Window {
    CooBridge?: unknown
  }
}

type JQueryLike = (target: unknown) => { on(event: string, handler: () => void): void }

/** 模组的脚本可能在 <head> 里执行，等 body 就绪再动 DOM。 */
function whenBody(fn: () => void): void {
  if (document.body) {
    fn()
    return
  }
  document.addEventListener('DOMContentLoaded', () => fn(), { once: true })
}

function boot(): void {
  whenBody(() => {
    try {
      if (!window.modUtils) {
        console.warn(`${TAG} 没找到 ModLoader，安静退出`)
        return
      }
      const i18n = detectI18n()
      if (i18n) showCompanionBanner(i18n)

      const kv = localKV()
      const book = new VocabBook(kv)
      const settings = loadSettings(kv)
      const bridge = new Bridge(readPortBase(settings.port))
      const ui = new Ui({
        book,
        sentenceCache: new JsonCache(kv, 'trans.v1'),
        wordCache: new JsonCache(kv, 'word.v1'),
        askSentence: (text) => bridge.askSentence(text),
        askWord: (word, sentence) => bridge.askWord(word, sentence),
        notifyVocab: (op, entry) => bridge.sendVocab(op, entry),
        settings: { ...settings, learning: settings.learning && !i18n },
        learning: settings.learning && !i18n,
        setLearning: (learning) => {
          settings.learning = learning
          saveSettings(kv, settings)
          bridge.setLearning(learning)
        },
        saveSettings: (next) => saveSettings(kv, next),
        connected: () => bridge.isConnected(),
        reconnect: () => bridge.reconnect(),
      })
      ui.mount()
      bridge.setHooks({
        onStatus: (status) => ui.setStatus(status),
        onReply: (id, kind, payload) => ui.onReply(id, kind, payload),
        onReplyFailed: (id, code) => ui.onReplyFailed(id, code),
        onNotice: (level, text) => ui.toast(text, level === 'error'),
        onError: (code, message) => ui.toast(errorText(code, message), true),
        onConfig: (cfg) => ui.setLearning(cfg.enabled && cfg.learning),
        onStatusRequest: (id) => {
          void captureStatusPages()
            .then((text) => bridge.sendStatus(currentDay(), text ?? '', id))
            .catch(() => bridge.sendStatus(currentDay(), '', id))
        },
        onCommand: (cmd) => {
          const result = applyVocabCommand(book, cmd)
          if (!result) return
          bridge.sendVocab(result.op, result.entry)
          ui.refresh()
        },
      })
      const version = gameVersion()
      if (version !== 'unknown' && version !== SUPPORTED_GAME) {
        ui.toast(`游戏版本 ${version} 未验证（本模组针对 ${SUPPORTED_GAME}）`, true)
      }
      // StartConfig 可能比模组脚本晚一步就绪；3 秒后再核对一次。
      if (version === 'unknown') {
        window.setTimeout(() => {
          const late = gameVersion()
          if (late !== 'unknown' && late !== SUPPORTED_GAME) {
            ui.toast(`游戏版本 ${late} 未验证（本模组针对 ${SUPPORTED_GAME}）`, true)
          }
        }, 3000)
      }
      bridge.start()
      hookPassages(() => bridge.onPassage())
      window.CooBridge = { bridge, ui, version: CLIENT_VERSION, diag: () => ui.diagnostics(), report: () => ui.diagnosticText() }
      console.log(`${TAG} 已加载 ${CLIENT_VERSION}，游戏 ${gameVersion()}`)
    } catch (err) {
      console.error(`${TAG} 启动失败`, err)
    }
  })
}

// ── 环境检测 ──────────────────────────────────────────────────────────────

function detectI18n(): string | null {
  try {
    const direct = window.modUtils?.getNowMainLanguage?.()
    const manager = window.modSC2DataManager?.getLanguageManager?.()?.mainLanguage
    return detectI18nFrom({
      modNames: window.modUtils?.getModListName?.(),
      mainLanguage: typeof direct === 'string' ? direct : manager,
      documentLang: document.documentElement.lang,
      sampleText: document.querySelector('#passages')?.textContent?.slice(0, 2000) ?? '',
    })
  } catch (err) {
    console.warn(`${TAG} 语言检测出错，按英文继续`, err)
    return null
  }
}

function gameVersion(): string {
  try {
    return pickGameVersion({
      startConfig: window.StartConfig,
      variables: window.State?.variables as Record<string, unknown> | undefined,
      storyText: window.Story?.get?.('Version')?.text,
    })
  } catch {
    return 'unknown'
  }
}

// ── passage 钩子 ──────────────────────────────────────────────────────────

function hookPassages(onChange: () => void): void {
  const $ = window.jQuery as JQueryLike | undefined
  if ($) {
    $(document).on(':passagedisplay', () => {
      try {
        onChange()
      } catch (err) {
        console.warn(`${TAG} passage 钩子出错`, err)
      }
    })
    return
  }

  // 没有 jQuery（或框架换了容器）时：盯 body，防抖后再读；readScene 自己会去重。
  if (!document.body) return
  let timer = 0
  const mo = new MutationObserver(() => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => onChange(), 250)
  })
  mo.observe(document.body, { childList: true, subtree: true })
}

// ── 场景读取 ──────────────────────────────────────────────────────────────

function readScene(): Scene | null {
  try {
    const passage = String(window.State?.passage ?? '')
    if (!passage) return null
    return readSceneFrom({
      passage,
      root: resolvePassageRoot(document),
      variables: window.State?.variables as Record<string, unknown> | undefined,
    })
  } catch (err) {
    console.warn(`${TAG} 读场景失败`, err)
    return null
  }
}

// ── 连接 ──────────────────────────────────────────────────────────────────

type Status = 'idle' | 'connecting' | 'connected' | 'offline'

interface BridgeHooks {
  onStatus(status: Status): void
  onReply(id: string, kind: 'sentence' | 'word', payload: unknown): void
  onReplyFailed?(id: string, code: string): void
  onNotice?(level: 'info' | 'warn' | 'error', text: string): void
  onError?(code: string, message: string): void
  onCommand?(cmd: VocabCommand): void
  onConfig?(cfg: { enabled: boolean; learning: boolean; attitude: string; adult: boolean }): void
  onStatusRequest?(id: string): void
}

class Bridge {
  private readonly portBase: number
  private socket: WebSocket | null = null
  private portIndex = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private status: Status = 'idle'
  private lastSceneKey = ''
  private pending = new Map<string, 'sentence' | 'word'>()
  private hooks: BridgeHooks | null = null

  constructor(portBase: number) {
    this.portBase = portBase
  }

  setHooks(hooks: BridgeHooks): void {
    this.hooks = hooks
  }

  start(): void {
    this.connect()
  }

  getStatus(): Status {
    return this.status
  }

  isConnected(): boolean {
    return this.status === 'connected'
  }

  onPassage(): void {
    if (this.status !== 'connected') return
    const scene = readScene()
    if (!scene) return
    const key = `${scene.passage}|${scene.text.length}|${scene.text.slice(0, 60)}`
    if (key === this.lastSceneKey) return
    this.lastSceneKey = key
    this.send({
      type: 'scene',
      seq: Date.now(),
      passage: scene.passage,
      text: scene.text,
      choices: scene.choices,
      state: scene.state,
      ...(scene.title ? { title: scene.title } : {}),
      ...(scene.sidebar ? { sidebar: scene.sidebar } : {}),
    })
  }

  askSentence(text: string): string | null {
    if (!this.isConnected()) return null
    const id = requestId('s', text)
    this.pending.set(id, 'sentence')
    this.send({ type: 'sentence', id, text })
    return id
  }

  askWord(word: string, sentence: string): string | null {
    if (!this.isConnected()) return null
    const id = requestId('w', `${word}|${sentence}`)
    this.pending.set(id, 'word')
    this.send({ type: 'word', id, word, sentence })
    return id
  }

  /** 立即发一次心跳（切回前台/获得焦点时用，避免后台节流导致 World 判超时）。 */
  ping(): void {
    this.send({ type: 'ping' })
  }

  sendStatus(day: number, text: string, id?: string): void {
    if (!this.isConnected()) return
    this.send({ type: 'status', day, text, ...(id ? { id } : {}) })
  }

  /** 让 World 切换学习/非学习模式。 */
  setLearning(learning: boolean): void {
    if (!this.isConnected()) return
    this.send({ type: 'command', command: 'learning', payload: { learning } })
  }

  sendVocab(op: 'add' | 'remove' | 'review' | 'mastered', entry: Record<string, unknown>): void {
    if (!this.isConnected()) return
    this.send({ type: 'vocab', op, entry })
  }

  reconnect(): void {
    this.closeSocket()
    this.portIndex = 0
    this.connect()
  }

  // ── 内部 ────────────────────────────────────────────────────────────────

  private connect(): void {
    this.stopHeartbeat()
    const port = this.portBase + this.portIndex
    this.setStatus('connecting')
    let settled = false
    let ws: WebSocket
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}`)
    } catch (err) {
      console.warn(`${TAG} 建连接失败`, err)
      this.scheduleRetry()
      return
    }
    this.socket = ws

    const fail = (): void => {
      if (settled) return
      settled = true
      this.portIndex = (this.portIndex + 1) % PORT_COUNT
      this.scheduleRetry(800)
    }

    ws.onopen = () => {
      if (settled) return
      settled = true
      this.send({
        type: 'hello',
        protocol: PROTOCOL_VERSION,
        client: { name: 'CooBridge', version: CLIENT_VERSION },
        game: { version: gameVersion(), passage: String(window.State?.passage ?? ''), lang: 'en' },
      })
    }
    ws.onmessage = (ev) => this.onMessage(String(ev.data))
    ws.onerror = () => fail()
    ws.onclose = (ev) => {
      if (this.socket === ws) this.socket = null
      this.stopHeartbeat()
      this.setStatus('offline')
      this.pending.clear()
      if (ev.code === 4001) {
        console.warn(`${TAG} 连接被另一个游戏页面接管，30 秒后再试`)
        this.scheduleRetry(30_000)
      } else {
        this.scheduleRetry(1500)
      }
    }
  }

  private closeSocket(): void {
    this.stopHeartbeat()
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    try {
      this.socket?.close()
    } catch {
      /* 忽略 */
    }
    this.socket = null
  }

  /** 每 20 秒发一次 ping，避免被 World 的 60 秒静默判定踢掉。 */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeat = setInterval(() => this.send({ type: 'ping' }), 15_000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  private scheduleRetry(delay = 1500): void {
    if (this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (this.status !== 'connected') this.connect()
    }, delay)
  }

  private onMessage(raw: string): void {
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      return
    }
    const msg = decodeWorldMessage(json)
    if (!msg) return
    switch (msg.type) {
      case 'hello_ok':
        this.setStatus('connected')
        this.startHeartbeat()
        // 重连后把当前场景再发一次，避免 Coo 丢掉上下文
        this.lastSceneKey = ''
        this.onPassage()
        return
      case 'reply':
        this.pending.delete(msg.id)
        if (msg.ok && msg.payload) this.hooks?.onReply(msg.id, msg.kind, msg.payload)
        else this.hooks?.onReplyFailed?.(msg.id, msg.error ?? 'unknown')
        return
      case 'notice':
        console.info(`${TAG} ${msg.text}`)
        this.hooks?.onNotice?.(msg.level, msg.text)
        return
      case 'error':
        console.error(`${TAG} World 报错 ${msg.code}: ${msg.message}`)
        this.hooks?.onError?.(msg.code, msg.message)
        this.setStatus('offline')
        return
      case 'config':
        this.hooks?.onConfig?.(msg)
        return
      case 'status_request':
        this.hooks?.onStatusRequest?.(msg.id)
        return
      case 'command':
        this.hooks?.onCommand?.(msg.payload)
        return
      case 'pong':
        return
      default:
        return
    }
  }

  private send(msg: ModMessage): void {
    const ws = this.socket
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try {
      ws.send(encode(msg))
    } catch (err) {
      console.warn(`${TAG} 发送失败`, err)
    }
  }

  private setStatus(next: Status): void {
    if (this.status === next) return
    this.status = next
    this.hooks?.onStatus(next)
  }
}

// ── 汉化拦截提示 ──────────────────────────────────────────────────────────

function showCompanionBanner(message: string): void {
  console.warn(`${TAG} 检测到中文本地化，切换为非学习模式：${message}`)
  document.getElementById('cb-fatal')?.remove()
  const banner = document.createElement('div')
  banner.id = 'cb-fatal'
  banner.innerHTML = `<div class="cb-fatal-box">
    <h2>已切换为非学习模式</h2>
    <p>${escapeHtml(message)}</p>
    <p class="cb-fatal-hint">想继续学英语：圆点 → 设置 → 打开「学习英语模式」；本次运行有效。</p>
    <button type="button" class="cb-fatal-close">知道了</button>
  </div>`
  banner.querySelector('.cb-fatal-close')?.addEventListener('click', () => banner.remove())
  document.body.appendChild(banner)
}

function showFatal(message: string): void {
  console.error(`${TAG} ${message}`)
  document.getElementById('cb-fatal')?.remove()

  // 顶部横幅，不是全屏遮罩：不能挡住 Mod 管理器。
  const banner = document.createElement('div')
  banner.id = 'cb-fatal'
  banner.innerHTML = `<div class="cb-fatal-box">
    <h2>CooBridge 已停用</h2>
    <p>${escapeHtml(message)}</p>
    <p class="cb-fatal-hint">按 <b>Alt+M</b> 打开 Mod 管理器，移除汉化模组后重新载入；关掉这个提示不影响游戏。</p>
    <button type="button" class="cb-fatal-close">关闭提示</button>
  </div>`
  banner.querySelector('.cb-fatal-close')?.addEventListener('click', () => banner.remove())
  document.body.appendChild(banner)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

// 必须放在文件末尾：Bridge 是 class，存在暂时性死区；在声明前调用会 ReferenceError。
boot()

/** 当前游戏天数（$days）。 */
function currentDay(): number {
  const days = (window.State?.variables as Record<string, unknown> | undefined)?.['days']
  return typeof days === 'number' ? days : 0
}
