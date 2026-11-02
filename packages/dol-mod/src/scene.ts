/** 从游戏 DOM 读取当前场景：passage、正文、选项、状态。纯函数，便于测试。 */
import type { Choice, SceneState } from './protocol.ts'

export interface Scene {
  passage: string
  title?: string
  text: string
  choices: Choice[]
  state: SceneState
  /** 侧栏摘要：时间、钱、穿着、状态、提示。 */
  sidebar?: string
}

export interface SceneSource {
  passage: string
  root: ParentNode | null
  variables?: Record<string, unknown>
  /** 正文字符上限。 */
  limit?: number
  /** 页面文档，用于读侧栏。 */
  doc?: ParentNode | null
}

/**
 * 正文容器可能被框架换掉：
 * 原版 SugarCube 是 `#passages`，MapleBirch 是 `#passage-content`。
 * 取文本最多的那个，避免选中空壳。
 */
const PASSAGE_SELECTORS = ['#passages', '#passage-content', '.passage-content', '.passage', '#story']

export function resolvePassageRoot(doc: ParentNode = document): HTMLElement | null {
  let best: HTMLElement | null = null
  let bestLength = 0
  for (const selector of PASSAGE_SELECTORS) {
    for (const node of doc.querySelectorAll(selector)) {
      const el = node as HTMLElement
      const length = (el.textContent ?? '').trim().length
      if (length > bestLength) {
        best = el
        bestLength = length
      }
    }
  }
  return best
}

/** 诊断用：当前命中哪个容器。 */
export function describePassageRoot(doc: ParentNode = document): string {
  const root = resolvePassageRoot(doc)
  if (!root) return 'none'
  if (root.id) return `#${root.id}`
  const cls = (root.className || '').toString().trim().split(/\s+/)[0]
  return cls ? `.${cls}` : root.tagName.toLowerCase()
}

export function cleanLabel(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    // DoL 的快捷键编号：numberPrepend="(" + numberAppend=") "，例如 "(1) Go outside"
    .replace(/^\s*\(\s*\d+\s*\)\s*/, '')
    .replace(/^\s*\d+\s*[.、)]\s*/, '')
    .replace(/^\s*[-–—•]\s*/, '')
    .trim()
}

export function readScene(src: SceneSource): Scene | null {
  const passage = src.passage.trim()
  if (!passage || !src.root) return null

  const rootEl = src.root as HTMLElement
  const raw = typeof rootEl.innerText === 'string' && rootEl.innerText ? rootEl.innerText : (rootEl.textContent ?? '')
  const text = normalize(raw)
  if (!text) return null

  const choices: Choice[] = []
  for (const a of src.root.querySelectorAll('a.link-internal, a[data-passage]')) {
    const label = cleanLabel(a.textContent ?? '')
    if (!label || label.length > 200) continue
    choices.push({ index: choices.length + 1, label })
  }

  const scene: Scene = {
    passage,
    text: src.limit && src.limit > 0 ? text.slice(0, src.limit) : text,
    choices,
    state: readState(src.variables),
  }
  const sidebar = readSidebar(src.doc)
  if (sidebar) scene.sidebar = sidebar
  const title = src.root.querySelector('.passage-title, h1')
  if (title?.textContent) scene.title = title.textContent.trim().slice(0, 120)
  return scene
}

export function readState(variables: Record<string, unknown> | undefined): SceneState {
  const out: SceneState = {}
  if (!variables) return out

  const location = variables['location']
  if (typeof location === 'string' && location) out.location = location

  // DoL 的天数是 $days；$day 是别的含义，只在没有 $days 时才退回。
  const days = variables['days'] ?? variables['day']
  if (typeof days === 'number' && Number.isFinite(days)) out.day = days

  // $time 是「当天第几分钟」；老存档/别的版本可能已经是字符串。
  const time = variables['time']
  if (typeof time === 'number' && Number.isFinite(time)) out.time = formatClock(time)
  else if (typeof time === 'string' && time) out.time = time

  const money = variables['money']
  if (typeof money === 'number' && Number.isFinite(money)) out.money = money
  return out
}

/** 分钟数 → HH:MM（跨天按 24 小时取模）。 */
export function formatClock(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function normalize(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 侧栏摘要：去掉导航与按钮，只留时间/钱/穿着/状态/提示。 */
export function readSidebar(doc: ParentNode | null | undefined): string | undefined {
  if (!doc) return undefined
  const el = doc.querySelector('#sidebar, #story-caption, .sidebar')
  if (!el) return undefined
  const clone = el.cloneNode(true) as HTMLElement
  for (const sel of ['#menu', '#story-menu', 'a', 'button', '[role="button"]', 'input', 'select']) {
    clone.querySelectorAll(sel).forEach((node) => node.remove())
  }
  const text = normalize(clone.textContent ?? '').slice(0, 1500)
  return text || undefined
}
