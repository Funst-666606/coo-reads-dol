/**
 * 端到端：jsdom 当游戏页，加载构建产物 dist/CooBridge.js，连真实的 DolWorld 服务。
 *
 * 覆盖：启动 → 握手 → 场景上报 → Alt+点击发学句请求 → dol_teach 回传 → 卡片显示译文。
 * 这样 bundle、协议、服务端、UI 是一起被验证的，不只是各自的单测。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { DolWorld } from '../../cortico-world-dol/src/world.ts'
import { DOL_DEFAULTS, type DolConfig } from '../../cortico-world-dol/src/config.ts'
import type { WorldHost } from 'cortico/core/types.ts'

const DIR = join(process.cwd(), '.cache', 'e2e')
const BUNDLE_URL = new URL('../dist/CooBridge.js', import.meta.url)
const hasBundle = existsSync(BUNDLE_URL)
const bundle = hasBundle ? readFileSync(BUNDLE_URL, 'utf8') : ''

interface Pushed {
  type: string
  text: string
  meta?: Record<string, unknown>
}

async function waitFor(check: () => boolean, timeoutMs = 5000, label = '条件'): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error(`等 ${label} 超时`)
}

function makeHost(pushed: Pushed[]): WorldHost {
  return {
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    pushEvent: async (e: { type: string; text: string; meta?: Record<string, unknown> }) => {
      pushed.push({ type: e.type, text: e.text, ...(e.meta ? { meta: e.meta } : {}) })
      return { ...e, cursor: pushed.length }
    },
  } as unknown as WorldHost
}

test('构建产物 ↔ World：连接、场景、学句往返、卡片显示', { skip: !hasBundle && 'dist/CooBridge.js 不存在，先构建' }, async () => {
  rmSync(DIR, { recursive: true, force: true })
  mkdirSync(DIR, { recursive: true })

  const cfg: DolConfig = { ...DOL_DEFAULTS, port: 17321 }
  const pushed: Pushed[] = []
  const world = new DolWorld({ cfg, dataDir: DIR, timezone: 'Asia/Taipei', persist: () => {} })
  await world.start(makeHost(pushed))

  const dom = new JSDOM(
    `<!doctype html><html lang="en"><body>
       <div id="passages">
         <p id="p">It was an incredible night.</p>
         <a class="link-internal" data-passage="Outside">(1) Go outside</a>
       </div>
     </body></html>`,
    { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true },
  )
  const w = dom.window

  // 端口可被覆盖：避免依赖 17321（可能被真实运行的 World 占着）
  const status = (await world.invoke('main', 'status', [])) as { port: number }
  Object.assign(w, {
    __coobridgePort: status.port,
    modUtils: { getModListName: () => ['TweeReplacer'], getNowMainLanguage: () => 'en' },
    State: { passage: 'Bedroom', variables: { days: 3, time: 600, location: 'Orphanage' } },
    StartConfig: { version: '0.5.12.13' },
  })

  const textNode = w.document.getElementById('p')?.firstChild
  assert.ok(textNode)
  Object.assign(w.document, {
    caretRangeFromPoint: () => {
      const r = w.document.createRange()
      r.setStart(textNode, 13)
      r.setEnd(textNode, 13)
      return r
    },
  })

  w.eval(bundle)

  try {
    await waitFor(() => pushed.some((p) => p.type === 'dol.connected'), 5000, '连接事件')
    await waitFor(() => pushed.some((p) => p.type === 'dol.scene'), 5000, '场景事件')

    const scene = pushed.find((p) => p.type === 'dol.scene')
    assert.ok(scene)
    assert.match(scene.text, /Bedroom/)
    assert.match(scene.text, /It was an incredible night/)
    assert.match(scene.text, /Go outside/)
    assert.match(scene.text, /第 3 天/)
    assert.match(scene.text, /10:00/)

    // Alt+点击 → 学句请求
    w.document.getElementById('p')?.dispatchEvent(
      new w.MouseEvent('click', { bubbles: true, altKey: true, clientX: 60, clientY: 60 }),
    )
    await waitFor(() => pushed.some((p) => p.type === 'dol.ask'), 5000, '学句事件')
    const ask = pushed.find((p) => p.type === 'dol.ask')
    assert.ok(ask)
    const id = String(ask.meta?.['id'] ?? '')
    assert.ok(id)

    const teach = world.tools().find((t) => t.name === 'dol_teach')
    assert.ok(teach)
    const receipt = await teach.handler(
      { id, translation: '那是一个难以置信的夜晚。', notes: ['过去时叙述'] },
      {} as never,
    )
    assert.match(typeof receipt === 'string' ? receipt : receipt.text, /已送到/)

    const card = w.document.getElementById('cb-card')
    await waitFor(() => (card?.textContent ?? '').includes('难以置信的夜晚'), 5000, '卡片译文')
    assert.match(card?.textContent ?? '', /过去时叙述/)

    // Coo 改本地词库 → 游戏写入 localStorage → 镜像同步回 World
    const edit = world.tools().find((t) => t.name === 'dol_vocab_edit')
    assert.ok(edit)
    const editReceipt = await edit.handler(
      { action: 'add', word: 'incredible', gloss: '难以置信的' },
      {} as never,
    )
    assert.match(typeof editReceipt === 'string' ? editReceipt : editReceipt.text, /已让游戏/)
    await waitFor(
      () => (w.localStorage.getItem('cb.vocab.v1') ?? '').includes('incredible'),
      5000,
      '本地词库写入',
    )
    await new Promise((r) => setTimeout(r, 150))
    const status = (await world.invoke('main', 'status', [])) as { vocab: { total: number } }
    assert.equal(status.vocab.total, 1, 'World 镜像没收到生词')
  } finally {
    try {
      dom.window.close()
    } catch {
      /* 关闭时的 socket 错误忽略 */
    }
    await new Promise((r) => setTimeout(r, 50))
    await world.stop()
    rmSync(DIR, { recursive: true, force: true })
  }
})

test('构建产物：检测到汉化包时不连接、显示停用提示', { skip: !hasBundle && 'dist/CooBridge.js 不存在，先构建' }, () => {
  const dom = new JSDOM(`<!doctype html><html lang="en"><body><div id="passages"><p>x</p></div></body></html>`, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
  })
  const w = dom.window
  Object.assign(w, {
    modUtils: { getModListName: () => ['ModI18N'], getNowMainLanguage: () => 'zh' },
    State: { passage: 'Start', variables: {} },
    StartConfig: { version: '0.5.12.13' },
  })

  w.eval(bundle)
  try {
    const banner = w.document.getElementById('cb-fatal')
    assert.ok(banner, '应显示停用提示')
    assert.equal(w.document.getElementById('cb-badge'), null, '不应注入状态点')
    assert.equal(w.document.getElementById('cb-panel'), null, '不应注入面板')

    // 横幅必须能关掉；不能是全屏遮罩，否则会挡住 Mod 管理器
    const close = banner.querySelector('.cb-fatal-close')
    assert.ok(close, '停用提示必须有关闭按钮')
    close.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
    assert.equal(w.document.getElementById('cb-fatal'), null, '点关闭后应移除')
  } finally {
    dom.window.close()
  }
})
