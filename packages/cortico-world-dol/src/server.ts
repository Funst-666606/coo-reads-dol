/**
 * 本地 WsSocket 服务：只监听 127.0.0.1，给游戏页面里的模组用。
 *
 * 它不懂 Coo，也不懂游戏：只负责「握手 → 收消息 → 转给 World → 把 World 的答复送回去」。
 * 翻译请求的答复由 Coo 调工具产生，所以这里维护一份 pending 表与超时。
 */
import { createServer, type Server } from 'node:http'
import { WsServer, type WsSocket } from './ws.ts'
import {
  PROTOCOL_VERSION,
  decodeModMessage,
  encode,
  type ChoiceMsg,
  type ModMessage,
  type SceneMsg,
  type SentenceMsg,
  type SentencePayload,
  type ConfigMsg,
  type StatusMsg,
  type VocabMsg,
  type VocabCommand,
  type WordMsg,
  type WordPayload,
} from './protocol.ts'

export interface DolServerLog {
  info(msg: string, meta?: unknown): void
  warn(msg: string, meta?: unknown): void
}

export interface DolServerOptions {
  port: number
  version: string
  replyTimeoutMs?: number
  log: DolServerLog
  onScene(m: SceneMsg): void
  onChoice(m: ChoiceMsg): void
  onAsk(m: SentenceMsg): void
  onWordAsk(m: WordMsg): void
  onVocab(m: VocabMsg): void
  onStatus?(m: StatusMsg): void
  onConnection(connected: boolean): void
  onLearning?(learning: boolean): void
}

interface Pending {
  kind: 'sentence' | 'word'
  timer: ReturnType<typeof setTimeout>
}

const OPEN = 1

export class DolServer {
  private http: Server | null = null
  private wss: WsServer | null = null
  private socket: WsSocket | null = null
  private handshaken = false
  private lastSeen = 0
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private readonly pending = new Map<string, Pending>()

  actualPort = 0
  connected = false

  private readonly opts: DolServerOptions

  constructor(opts: DolServerOptions) {
    this.opts = opts
  }

  // ── 生命周期 ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const http = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('dol-with-coo ok')
    })
    this.http = http

    const wss = new WsServer()
    this.wss = wss
    http.on('upgrade', (req, socket, head) => {
      if (!originAllowed(req.headers.origin)) {
        this.opts.log.warn('dol: 拒绝来源', req.headers.origin)
        socket.destroy()
        return
      }
      wss.handleUpgrade(req, socket, head, (ws) => this.attach(ws))
    })

    this.actualPort = await listenWithRetry(http, this.opts.port)
    http.on('error', (err) => this.opts.log.warn('dol: http 错误', String(err)))

    this.heartbeat = setInterval(() => this.tick(), 15_000)
    this.heartbeat.unref?.()
    this.opts.log.info(`dol: 本地服务已启动 127.0.0.1:${this.actualPort}`)
  }

  async stop(): Promise<void> {
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
    this.failPending('timeout')
    for (const ws of this.wss?.clients ?? []) {
      try {
        ws.close(1001, 'world stopped')
      } catch {
        /* 忽略 */
      }
    }
    await new Promise<void>((resolve) => {
      if (!this.wss) return resolve()
      this.wss.close(() => resolve())
    })
    await new Promise<void>((resolve) => {
      if (!this.http) return resolve()
      this.http.close(() => resolve())
    })
    this.http = null
    this.wss = null
    this.socket = null
    this.handshaken = false
    this.setConnected(false)
  }

  // ── 对外 ────────────────────────────────────────────────────────────────

  status(): { connected: boolean; port: number; pending: number } {
    return { connected: this.connected, port: this.actualPort, pending: this.pending.size }
  }

  notify(level: 'info' | 'warn' | 'error', text: string): void {
    this.send({ type: 'notice', level, text })
  }

  /** 把模式/态度同步给游戏，游戏端据此隐藏或显示教学界面。 */
  sendConfig(msg: ConfigMsg): boolean {
    const ws = this.socket
    if (!ws || ws.readyState !== OPEN) return false
    this.send(msg)
    return true
  }

  /** 请求游戏实时重读二级页面。 */
  sendStatusRequest(id: string): boolean {
    const ws = this.socket
    if (!ws || ws.readyState !== OPEN) return false
    this.send({ type: 'status_request', id })
    return true
  }

  /** 让游戏改本地词库。游戏没连上时返回 false。 */
  sendCommand(payload: VocabCommand): boolean {
    const ws = this.socket
    if (!ws || ws.readyState !== OPEN) return false
    this.send({ type: 'command', command: 'vocab', payload })
    return true
  }

  /** Coo 通过 dol_teach 回传。找不到对应请求时返回 false（多半是已超时）。 */
  replySentence(id: string, payload: SentencePayload): boolean {
    const p = this.pending.get(id)
    if (!p || p.kind !== 'sentence') return false
    this.settle(id, p)
    this.send({ type: 'reply', id, kind: 'sentence', ok: true, payload, source: 'coo' })
    return true
  }

  /** Coo 通过 dol_define 回传。 */
  replyWord(id: string, payload: WordPayload): boolean {
    const p = this.pending.get(id)
    if (!p || p.kind !== 'word') return false
    this.settle(id, p)
    this.send({ type: 'reply', id, kind: 'word', ok: true, payload, source: payload.source })
    return true
  }

  // ── 连接 ────────────────────────────────────────────────────────────────

  private attach(ws: WsSocket): void {
    if (this.socket && this.socket.readyState === OPEN) {
      try {
        this.socket.close(4001, 'replaced')
      } catch {
        /* 忽略 */
      }
    }
    this.socket = ws
    this.handshaken = false
    this.lastSeen = Date.now()
    this.failPending('timeout')

    const hsTimer = setTimeout(() => {
      if (!this.handshaken) {
        try {
          ws.close(4002, 'hello timeout')
        } catch {
          /* 忽略 */
        }
      }
    }, 10_000)
    hsTimer.unref?.()

    ws.on('message', (data) => this.onMessage(ws, String(data), hsTimer))
    ws.on('close', () => {
      clearTimeout(hsTimer)
      if (this.socket !== ws) return
      this.socket = null
      this.handshaken = false
      this.failPending('timeout')
      this.setConnected(false)
    })
    ws.on('error', (err) => this.opts.log.warn('dol: socket 错误', String(err)))
  }

  private onMessage(ws: WsSocket, text: string, hsTimer: ReturnType<typeof setTimeout>): void {
    this.lastSeen = Date.now()
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      this.fail('bad_hello', '不是合法 JSON')
      return
    }
    const msg = decodeModMessage(raw)
    if (!msg) {
      this.fail('bad_hello', '消息格式不对')
      return
    }

    if (!this.handshaken) {
      if (msg.type !== 'hello') {
        this.fail('bad_hello', '首帧必须是 hello')
        return
      }
      if (msg.protocol !== PROTOCOL_VERSION) {
        this.fail('bad_hello', `协议版本 ${msg.protocol}，需要 ${PROTOCOL_VERSION}`)
        return
      }
      if (msg.game.lang !== 'en') {
        this.fail('i18n_detected', `只支持英文原版，当前语言 ${msg.game.lang}`)
        return
      }
      this.handshaken = true
      clearTimeout(hsTimer)
      this.send({
        type: 'hello_ok',
        protocol: PROTOCOL_VERSION,
        world: { version: this.opts.version },
        features: ['scene', 'sentence', 'word', 'vocab'],
      })
      this.setConnected(true)
      this.opts.log.info('dol: 模组已连接', { game: msg.game.version, client: msg.client.version })
      return
    }

    this.dispatch(msg)
  }

  private dispatch(msg: ModMessage): void {
    switch (msg.type) {
      case 'scene':
        this.opts.onScene(msg)
        return
      case 'choice':
        this.opts.onChoice(msg)
        return
      case 'sentence':
        this.track(msg.id, 'sentence')
        this.opts.onAsk(msg)
        return
      case 'word':
        this.track(msg.id, 'word')
        this.opts.onWordAsk(msg)
        return
      case 'command':
        if (msg.command === 'learning') this.opts.onLearning?.(msg.payload.learning)
        return
      case 'status':
        this.opts.onStatus?.(msg)
        return
      case 'vocab':
        this.opts.onVocab(msg)
        return
      case 'ping':
        this.send({ type: 'pong' })
        return
      case 'hello':
        return
      default:
        return
    }
  }

  // ── 工具 ────────────────────────────────────────────────────────────────

  private track(id: string, kind: 'sentence' | 'word'): void {
    const old = this.pending.get(id)
    if (old) clearTimeout(old.timer)
    const timer = setTimeout(() => {
      const p = this.pending.get(id)
      if (!p) return
      this.pending.delete(id)
      this.send({ type: 'reply', id, kind, ok: false, error: 'timeout' })
      this.opts.log.warn(`dol: ${kind} 请求超时`, id)
    }, this.opts.replyTimeoutMs ?? 20_000)
    timer.unref?.()
    this.pending.set(id, { kind, timer })
  }

  private settle(id: string, p: Pending): void {
    clearTimeout(p.timer)
    this.pending.delete(id)
  }

  private failPending(_reason: string): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer)
      this.send({ type: 'reply', id, kind: p.kind, ok: false, error: 'coo_unavailable' })
    }
    this.pending.clear()
  }

  private send(payload: unknown): void {
    const ws = this.socket
    if (!ws || ws.readyState !== OPEN) return
    try {
      ws.send(encode(payload as never))
    } catch (err) {
      this.opts.log.warn('dol: 发送失败', String(err))
    }
  }

  private fail(code: 'bad_hello' | 'i18n_detected', message: string): void {
    this.send({ type: 'error', code, message })
    const ws = this.socket
    if (!ws) return
    try {
      ws.close(4003, code)
    } catch {
      /* 忽略 */
    }
  }

  private tick(): void {
    const ws = this.socket
    if (!ws || ws.readyState !== OPEN) return
    if (Date.now() - this.lastSeen > 120_000) {
      this.opts.log.warn('dol: 60 秒没有消息，断开')
      try {
        ws.terminate()
      } catch {
        /* 忽略 */
      }
      return
    }
    this.send({ type: 'pong' })
  }

  private setConnected(next: boolean): void {
    if (this.connected === next) return
    this.connected = next
    this.opts.onConnection(next)
  }
}

function originAllowed(origin: string | undefined): boolean {
  if (!origin || origin === 'null') return true
  if (origin.startsWith('file://')) return true
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)
}

function listenWithRetry(http: Server, port: number): Promise<number> {
  const start = Math.max(1, Math.floor(port) || 17321)
  return new Promise((resolve, reject) => {
    let current = start
    const tryOnce = (): void => {
      const onError = (err: NodeJS.ErrnoException): void => {
        http.removeListener('error', onError)
        if (err.code === 'EADDRINUSE' && current < start + 9) {
          current += 1
          tryOnce()
          return
        }
        reject(err)
      }
      http.once('error', onError)
      http.listen(current, '127.0.0.1', () => {
        http.removeListener('error', onError)
        resolve(current)
      })
    }
    tryOnce()
  })
}
