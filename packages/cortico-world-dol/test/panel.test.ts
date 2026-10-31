/**
 * 面板脚本测试：按框架的 WebUiPanelContext 契约造一个假 ctx，
 * 在 jsdom 里 mount dist/webui.js，验证渲染、刷新、模式切换。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const PANEL_URL = new URL('../dist/webui.js', import.meta.url)
const hasPanel = existsSync(PANEL_URL)

interface Call {
  method: string
  args: unknown[] | undefined
}

interface FakeUi {
  h(tag: string, cls?: string | null, text?: string | null): HTMLElement
  esc(s: unknown): string
  sheet(opts: { title: string }): { el: HTMLElement; body: HTMLElement; note: HTMLElement; desc: HTMLElement | null }
  kv(rows: ReadonlyArray<{ k: string; v: unknown }>): HTMLElement
  segmented(
    items: ReadonlyArray<string | { value: string; label?: string }>,
    opts?: { value?: string; onSelect?: (value: string) => void },
  ): { el: HTMLElement; value: string; setValue(v: string): void }
  rowbar(): HTMLElement
  section(title: string, desc?: string): HTMLElement
  actions(): HTMLElement
  button(label: string, opts?: { size?: string; onClick?: (ev: MouseEvent) => void }): HTMLButtonElement
  pill(text: string, tone?: string): HTMLElement
  msgline(text?: string): HTMLElement
  table(): {
    el: HTMLElement
    body: HTMLElement
    addRow(cells: readonly unknown[]): HTMLElement
    clear(): void
  }
  toast(text: string, tone?: string): { dispose(): void }
}

function makeUi(document: Document, calls: Call[]): FakeUi {
  const el = (tag: string, cls?: string | null, text?: string | null): HTMLElement => {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text) node.textContent = text
    return node
  }

  return {
    h: (tag, cls, text) => el(tag, cls, text),
    esc: (s) => String(s),
    sheet: (opts) => {
      const wrap = el('section', 'sheet')
      const body = el('div', 'body')
      wrap.append(el('h3', null, opts.title), body)
      return { el: wrap, body, note: el('div'), desc: null }
    },
    kv: (rows) => {
      const box = el('div', 'kv')
      for (const row of rows) {
        const line = el('div', 'kvline')
        const value = el('span', 'v')
        if (typeof row.v === 'string') value.textContent = row.v
        else if (row.v && typeof (row.v as Node).nodeType === 'number') value.append(row.v as Node)
        line.append(el('span', 'k', row.k), value)
        box.append(line)
      }
      return box
    },
    segmented: (items, opts) => {
      const wrap = el('div', 'seg')
      let value = opts?.value ?? ''
      for (const item of items) {
        const v = typeof item === 'string' ? item : item.value
        const label = typeof item === 'string' ? item : (item.label ?? v)
        const btn = el('button', null, label) as HTMLButtonElement
        btn.dataset['value'] = v
        btn.addEventListener('click', () => {
          value = v
          opts?.onSelect?.(v)
        })
        wrap.append(btn)
      }
      return {
        el: wrap,
        get value() {
          return value
        },
        setValue: (v: string) => {
          value = v
        },
      }
    },
    rowbar: () => el('div', 'rowbar'),
    section: (title, desc) => el('div', 'section', desc ? `${title} ${desc}` : title),
    actions: () => el('div', 'actions'),
    button: (label, opts) => {
      const b = el('button', null, label) as HTMLButtonElement
      b.addEventListener('click', (ev) => opts?.onClick?.(ev as MouseEvent))
      return b
    },
    pill: (text, tone) => el('span', `pill ${tone ?? ''}`, text),
    msgline: (text) => el('div', 'msgline', text ?? ''),
    table: () => {
      const wrap = el('div', 'tablewrap')
      const table = el('table')
      const body = el('tbody')
      table.append(body)
      wrap.append(table)
      return {
        el: wrap,
        body,
        addRow: (cells) => {
          const tr = el('tr')
          for (const c of cells) tr.append(el('td', null, String(c)))
          body.append(tr)
          return tr
        },
        clear: () => {
          body.replaceChildren()
        },
      }
    },
    toast: (text, tone) => {
      calls.push({ method: `toast:${tone ?? 'ok'}`, args: [text] })
      return { dispose: () => {} }
    },
  }
}

test('面板：状态、生词表、模式切换', { skip: !hasPanel && '先构建 dist/webui.js' }, async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
  const window = dom.window
  const document = window.document
  Object.assign(globalThis, { window, document })

  const calls: Call[] = []
  const status = {
    connected: true,
    port: 17321,
    mode: 'trigger',
    passage: 'Bedroom',
    day: 3,
    location: 'Orphanage',
    todayComments: 2,
    commentCap: 40,
    vocab: { total: 2, due: 1 },
  }

  const ctx = {
    pageId: 'world:dol',
    panelId: 'main',
    language: 'zh',
    root: document.createElement('div'),
    signal: new AbortController().signal,
    invoke: async (method: string, args?: unknown[]) => {
      calls.push({ method, args })
      if (method === 'status') return status
      if (method === 'vocab') {
        return [
          { word: 'dark', lemma: 'dark', gloss: '黑暗的', dueAt: Date.now(), box: 0 },
          { word: 'light', lemma: 'light', gloss: '光', dueAt: Date.now(), box: 1 },
        ]
      }
      if (method === 'setMode') return { ...status, mode: args?.[0] }
      return ''
    },
    interval: () => ({ dispose: () => {} }),
    ui: makeUi(document, calls),
  }

  const panel = (await import(PANEL_URL.href)) as {
    default: { panels: Record<string, { mount: (ctx: unknown) => Promise<void> }> }
  }
  await panel.default.panels['main']?.mount(ctx)

  const text = ctx.root.textContent ?? ''
  assert.match(text, /DoL 陪读/)
  assert.match(text, /已连接/)
  assert.match(text, /17321/)
  assert.match(text, /Bedroom/)
  assert.match(text, /dark/)
  assert.match(text, /黑暗的/)
  assert.match(text, /会主动评论/)
  assert.match(text, /当前：触发/)
  assert.equal(ctx.root.querySelectorAll('tbody tr').length, 2)

  const proactive = [...ctx.root.querySelectorAll('button')].find((b) => b.textContent === '主动')
  assert.ok(proactive, '没有渲染模式按钮')
  proactive.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 10))

  const setMode = calls.find((c) => c.method === 'setMode')
  assert.ok(setMode, '点击模式没有调用 setMode')
  assert.deepEqual(setMode.args, ['proactive'])
})
