/**
 * DolServer 的端到端测试：用真的 WebSocket 客户端连本地服务，走完
 * 握手 → 场景 → 学句 → Coo 回传 的链路。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import { DolServer } from '../src/server.ts'
import { PROTOCOL_VERSION } from '../src/protocol.ts'

const PORT = 17891

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

function nextMessage(ws: WebSocket, type: string, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage)
      reject(new Error(`等 ${type} 超时`))
    }, timeoutMs)
    function onMessage(raw: WebSocket.RawData): void {
      const msg = JSON.parse(String(raw)) as Record<string, unknown>
      if (msg['type'] !== type) return
      clearTimeout(timer)
      ws.off('message', onMessage)
      resolve(msg)
    }
    ws.on('message', onMessage)
  })
}

function hello(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    client: { name: 'test', version: '0.0.0' },
    game: { version: '0.5.12.13', passage: 'Start', lang: 'en' },
    ...overrides,
  })
}

function makeServer(port: number, hooks: Partial<ConstructorParameters<typeof DolServer>[0]> = {}): DolServer {
  return new DolServer({
    port,
    version: 'test',
    log: { info: () => {}, warn: () => {} },
    onScene: () => {},
    onChoice: () => {},
    onAsk: () => {},
    onWordAsk: () => {},
    onVocab: () => {},
    onConnection: () => {},
    ...hooks,
  })
}

test('握手 → 场景 → 学句 → 回复', async () => {
  const events: string[] = []
  let onAsk: (id: string) => void = () => {}
  const asked = new Promise<string>((resolve) => {
    onAsk = resolve
  })

  const server = makeServer(PORT, {
    onScene: (m) => events.push(`scene:${m.passage}`),
    onAsk: (m) => onAsk(m.id),
    onConnection: (c) => events.push(`conn:${c}`),
  })
  await server.start()

  const ws = await connect(`ws://127.0.0.1:${server.actualPort}`)
  try {
    const helloOk = nextMessage(ws, 'hello_ok')
    ws.send(hello())
    const ok = await helloOk
    assert.equal(ok['protocol'], PROTOCOL_VERSION)
    assert.deepEqual(events, ['conn:true'])

    ws.send(
      JSON.stringify({
        type: 'scene',
        seq: 1,
        passage: 'Bedroom',
        text: 'It is dark.',
        choices: [{ index: 1, label: 'Sleep' }],
        state: { day: 3 },
      }),
    )
    await new Promise((r) => setTimeout(r, 50))
    assert.deepEqual(events, ['conn:true', 'scene:Bedroom'])

    ws.send(JSON.stringify({ type: 'sentence', id: 's1', text: 'It is dark.' }))
    const id = await asked
    assert.equal(id, 's1')

    const replyPromise = nextMessage(ws, 'reply')
    const sent = server.replySentence('s1', { translation: '天很黑。', notes: ['现在时描述状态'] })
    assert.equal(sent, true)
    const reply = await replyPromise
    assert.equal(reply['ok'], true)
    assert.deepEqual(reply['payload'], { translation: '天很黑。', notes: ['现在时描述状态'] })

    // 同一个 id 再回一次，应当拒绝
    assert.equal(server.replySentence('s1', { translation: 'x', notes: [] }), false)
  } finally {
    ws.terminate()
    await server.stop()
  }
})

test('中文 hello 会被接受（汉化包）', async () => {
  const server = makeServer(PORT + 1)
  await server.start()
  const ws = await connect(`ws://127.0.0.1:${server.actualPort}`)
  try {
    const okPromise = nextMessage(ws, 'hello_ok')
    ws.send(hello({ game: { version: '0.5.12.13', passage: 'Start', lang: 'zh' } }))
    const ok = await okPromise
    assert.equal(ok['type'], 'hello_ok')
  } finally {
    ws.terminate()
    await server.stop()
  }
})

test('首帧不是 hello 会被拒绝', async () => {
  const server = makeServer(PORT + 2)
  await server.start()
  const ws = await connect(`ws://127.0.0.1:${server.actualPort}`)
  try {
    const errPromise = nextMessage(ws, 'error')
    ws.send(JSON.stringify({ type: 'ping' }))
    const err = await errPromise
    assert.equal(err['code'], 'bad_hello')
  } finally {
    ws.terminate()
    await server.stop()
  }
})

test('学句请求超时会回 timeout', async () => {
  const server = makeServer(PORT + 3, { replyTimeoutMs: 120 })
  await server.start()
  const ws = await connect(`ws://127.0.0.1:${server.actualPort}`)
  try {
    const helloOk = nextMessage(ws, 'hello_ok')
    ws.send(hello())
    await helloOk

    const replyPromise = nextMessage(ws, 'reply', 2000)
    ws.send(JSON.stringify({ type: 'sentence', id: 'slow', text: 'x' }))
    const reply = await replyPromise
    assert.equal(reply['ok'], false)
    assert.equal(reply['error'], 'timeout')
  } finally {
    ws.terminate()
    await server.stop()
  }
})
