/** 从游戏 DOM 读取当前场景：passage、正文、选项、状态。纯函数，便于测试。 */
import type { Choice, SceneState } from './protocol.ts'

export interface Scene {
  passage: string
  title?: string
  text: string
  choices: Choice[]
  state: SceneState
}

export interface SceneSource {
  passage: string
  root: ParentNode | null
  variables?: Record<string, unknown>
  /** 正文字符上限。 */
  limit?: number
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
    text: text.slice(0, src.limit ?? 4000),
    choices,
    state: readState(src.variables),
  }
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
