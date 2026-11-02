/**
 * DolWorld 集成测试：假宿主 + 真 WebSocket 客户端。
 * 覆盖：工具表、场景/学句事件、dol_teach 回传、生词镜像、模式切换、面板数据面。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DolWorld } from '../src/world.ts'
import { DOL_DEFAULTS, type DolConfig } from '../src/config.ts'
import { PROTOCOL_VERSION } from '../src/protocol.ts'
import type { WorldHost } from 'cortico/core/types.ts'

const DIR = join(process.cwd(), '.cache', 'world-test')
const PORT = 17899

interface Pushed {
  type: string
  text: string
}

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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

test('webUi 声明：面板、配置组、环境提示文件都在', () => {
  const world = new DolWorld({
    cfg: { ...DOL_DEFAULTS },
    dataDir: DIR,
    timezone: 'Asia/Taipei',
    persist: () => {},
  })

  const decl = world.webUi('zh')
  assert.ok(decl.panels?.some((p) => p.id === 'main'))
  const group = decl.config?.find((g) => g.id === 'dol')
  assert.ok(group)
  assert.equal(group.owner, 'world:dol')
  assert.ok(group.schema.properties['worlds.dol.mode'])
  assert.ok(group.schema.properties['worlds.dol.port'])

  const doc = decl.promptDocs?.[0]
  assert.ok(doc)
  assert.equal(doc.role, 'envPrompt')
  assert.ok(existsSync(doc.path), `环境提示文件不存在：${doc.path}`)

  const vars = world.envPromptVars()
  assert.equal(vars['mode'], 'trigger')
  assert.equal(vars['connected'], 'no')
})

test('World：事件、工具回传、生词镜像、模式切换', async () => {
  rmSync(DIR, { recursive: true, force: true })
  mkdirSync(DIR, { recursive: true })

  const cfg: DolConfig = { ...DOL_DEFAULTS, port: PORT }
  const pushed: Pushed[] = []
  const host = {
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    pushEvent: async (e: { type: string; text: string }) => {
      pushed.push({ type: e.type, text: e.text })
      return { ...e, cursor: pushed.length }
    },
  } as unknown as WorldHost

  const world = new DolWorld({
    cfg,
    dataDir: DIR,
    timezone: 'Asia/Taipei',
    persist: (patch) => Object.assign(cfg, patch),
  })

  await world.start(host)
  const tools = world.tools()
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ['dol_define', 'dol_mode', 'dol_now', 'dol_setup', 'dol_status', 'dol_teach', 'dol_vocab', 'dol_vocab_edit'],
  )

  const ws = await connect(`ws://127.0.0.1:${PORT}`)
  try {
    const helloOk = nextMessage(ws, 'hello_ok')
    ws.send(
      JSON.stringify({
        type: 'hello',
        protocol: PROTOCOL_VERSION,
        client: { name: 'test', version: '0' },
        game: { version: '0.5.12.13', passage: 'Start', lang: 'en' },
      }),
    )
    await helloOk

    ws.send(
      JSON.stringify({
        type: 'scene',
        seq: 1,
        passage: 'Bedroom',
        text: 'It is dark.',
        choices: [{ index: 1, label: 'Sleep' }],
        state: { day: 3, location: 'Bedroom' },
      }),
    )
    await sleep(60)
    assert.ok(pushed.some((p) => p.type === 'dol.scene'))

    ws.send(JSON.stringify({ type: 'sentence', id: 's1', text: 'It is dark.' }))
    await sleep(60)
    assert.ok(pushed.some((p) => p.type === 'dol.ask'))

    const teach = tools.find((t) => t.name === 'dol_teach')
    assert.ok(teach)
    const replyPromise = nextMessage(ws, 'reply')
    const receipt = await teach.handler({ id: 's1', translation: '天很黑。', notes: ['现在时'] }, {} as never)
    assert.match(typeof receipt === 'string' ? receipt : receipt.text, /已送到/)
    const reply = await replyPromise
    assert.equal(reply['ok'], true)

    ws.send(
      JSON.stringify({
        type: 'vocab',
        op: 'add',
        entry: { word: 'dark', lemma: 'dark', gloss: '黑暗的', dueAt: Date.now() - 1000, box: 0 },
      }),
    )
    await sleep(60)

    const status = (await world.invoke('main', 'status', [])) as Record<string, unknown>
    assert.equal((status['vocab'] as { total: number }).total, 1)
    assert.equal(status['passage'], 'Bedroom')

    const vocab = (await world.invoke('main', 'vocab', [])) as Array<Record<string, unknown>>
    assert.equal(vocab[0]?.['lemma'], 'dark')

    const vocabTool = tools.find((t) => t.name === 'dol_vocab')
    assert.ok(vocabTool)
    const dueAnswer = await vocabTool.handler({ action: 'due' }, {} as never)
    assert.match(typeof dueAnswer === 'string' ? dueAnswer : dueAnswer.text, /dark/)
    const statsAnswer = await vocabTool.handler({}, {} as never)
    assert.match(typeof statsAnswer === 'string' ? statsAnswer : statsAnswer.text, /生词 1 个/)

    await world.invoke('main', 'setMode', ['passive'])
    assert.equal(cfg.mode, 'passive')

    const csv = (await world.invoke('main', 'exportCsv', [])) as string
    assert.match(csv, /"dark"/)

    // 断线重连抖动：30 秒内不重复推连接事件，避免刷屏 Coo
    ws.terminate()
    await sleep(60)
    const ws2 = await connect(`ws://127.0.0.1:${PORT}`)
    await sleep(80)
    assert.equal(pushed.filter((p) => p.type === 'dol.connected').length, 1, '重连不应重复报连接')
    assert.equal(pushed.filter((p) => p.type === 'dol.disconnected').length, 0, '短暂断开不应报断开')
    ws2.terminate()
  } finally {
    ws.terminate()
    await world.stop()
    rmSync(DIR, { recursive: true, force: true })
  }
})
