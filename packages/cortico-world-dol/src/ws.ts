/**
 * 极简 WebSocket 服务端（RFC 6455 子集）：只做本模组需要的事——
 * 文本帧、分片、ping/pong、close。不依赖第三方包，保证本机目录安装可用。
 */
import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const OPEN = 1
const CLOSING = 2
const CLOSED = 3

type Handler = (...args: never[]) => void

export class WsSocket {
  readyState = OPEN
  readonly bufferedAmount = 0
  private readonly socket: Duplex
  private buffer = Buffer.alloc(0)
  private fragments: Buffer[] = []
  private handlers = new Map<string, Handler[]>()

  constructor(socket: Duplex) {
    this.socket = socket
    socket.on('data', (chunk: Buffer) => this.feed(chunk))
    socket.on('close', () => this.finish())
    socket.on('error', (err) => {
      this.emit('error', err as never)
      this.finish()
    })
  }

  on(event: 'message' | 'close' | 'error', handler: Handler): this {
    const list = this.handlers.get(event) ?? []
    list.push(handler)
    this.handlers.set(event, list)
    return this
  }

  send(text: string): void {
    if (this.readyState !== OPEN) return
    this.writeFrame(0x1, Buffer.from(text, 'utf8'))
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === CLOSED) return
    this.readyState = CLOSING
    const body = Buffer.alloc(2 + Buffer.byteLength(reason))
    body.writeUInt16BE(code, 0)
    body.write(reason, 2)
    this.writeFrame(0x8, body)
    this.socket.end()
    this.finish()
  }

  terminate(): void {
    this.socket.destroy()
    this.finish()
  }

  private emit(event: 'message' | 'close' | 'error', ...args: unknown[]): void {
    for (const fn of this.handlers.get(event) ?? []) {
      ;(fn as (...a: unknown[]) => void)(...args)
    }
  }

  private finish(): void {
    if (this.readyState === CLOSED) return
    this.readyState = CLOSED
    this.emit('close')
  }

  private feed(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      const frame = this.parse()
      if (!frame) return
      if (frame.opcode === 0x8) {
        this.close(1000)
        return
      }
      if (frame.opcode === 0x9) {
        this.writeFrame(0xa, frame.payload)
        continue
      }
      if (frame.opcode === 0xa) continue
      if (frame.opcode === 0x0) this.fragments.push(frame.payload)
      else this.fragments = [frame.payload]
      if (!frame.fin) continue
      const data = Buffer.concat(this.fragments)
      this.fragments = []
      this.emit('message', data.toString('utf8'))
    }
  }

  private parse(): { fin: boolean; opcode: number; payload: Buffer } | null {
    const buf = this.buffer
    if (buf.length < 2) return null
    const fin = (buf[0]! & 0x80) !== 0
    const opcode = buf[0]! & 0x0f
    const masked = (buf[1]! & 0x80) !== 0
    let len = buf[1]! & 0x7f
    let offset = 2
    if (len === 126) {
      if (buf.length < 4) return null
      len = buf.readUInt16BE(2)
      offset = 4
    } else if (len === 127) {
      if (buf.length < 10) return null
      const big = buf.readBigUInt64BE(2)
      if (big > BigInt(16 * 1024 * 1024)) throw new Error('frame too large')
      len = Number(big)
      offset = 10
    }
    let mask: Buffer | null = null
    if (masked) {
      if (buf.length < offset + 4) return null
      mask = buf.subarray(offset, offset + 4)
      offset += 4
    }
    if (buf.length < offset + len) return null
    const payload = Buffer.from(buf.subarray(offset, offset + len))
    if (mask) for (let i = 0; i < payload.length; i++) payload[i]! ^= mask[i % 4]!
    this.buffer = buf.subarray(offset + len)
    return { fin, opcode, payload }
  }

  private writeFrame(opcode: number, payload: Buffer): void {
    if (this.socket.destroyed) return
    const len = payload.length
    let header: Buffer
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len])
    } else if (len < 65536) {
      header = Buffer.alloc(4)
      header[0] = 0x80 | opcode
      header[1] = 126
      header.writeUInt16BE(len, 2)
    } else {
      header = Buffer.alloc(10)
      header[0] = 0x80 | opcode
      header[1] = 127
      header.writeBigUInt64BE(BigInt(len), 2)
    }
    this.socket.write(Buffer.concat([header, payload]))
  }
}

/** 升级 HTTP 连接；失败时销毁 socket，不抛到进程。 */
export class WsServer {
  readonly clients = new Set<WsSocket>()
  private closed = false

  handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    onConnection: (ws: WsSocket) => void,
  ): void {
    const key = req.headers['sec-websocket-key']
    if (this.closed || typeof key !== 'string' || !key) {
      socket.destroy()
      return
    }
    const accept = createHash('sha1').update(key + GUID).digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )
    if (head.length > 0) socket.unshift(head)

    const ws = new WsSocket(socket)
    this.clients.add(ws)
    ws.on('close', (() => this.clients.delete(ws)) as never)
    onConnection(ws)
  }

  close(cb?: () => void): void {
    this.closed = true
    for (const ws of this.clients) {
      try {
        ws.close(1001, 'server closing')
      } catch {
        /* 忽略 */
      }
    }
    this.clients.clear()
    cb?.()
  }
}

export { OPEN }
