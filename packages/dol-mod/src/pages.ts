/** 抓取 DoL 二级页面：特性 / 社交 / 特质 / 日志。 */
export const STATUS_PAGES = [
  ['CHARACTERISTICS', '特性'],
  ['SOCIAL', '社交'],
  ['TRAITS', '特质'],
  ['JOURNAL', '日志'],
] as const

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isVisible(el: Element | null): boolean {
  if (!el) return false
  const style = getComputedStyle(el as HTMLElement)
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
}

function findButton(doc: ParentNode, name: string): HTMLElement | null {
  const upper = name.toUpperCase()
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('button, a, [role="button"], [data-passage]'))) {
    const text = (el.textContent ?? '').trim().toUpperCase()
    if (text === upper || text.startsWith(`${upper} `)) return el
  }
  return null
}

function overlay(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('#customOverlay, .customOverlay')
}

/** 侧栏其余内容：时间、钱、穿着、提醒、底部 tip。去掉导航与七项状态。 */
export function readSidebarText(doc: Document): string {
  const sidebar = doc.querySelector<HTMLElement>('#sidebar, #story-caption, .sidebar')
  if (!sidebar) return ''
  const tabs = Array.from(doc.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
    .map((el) => (el.textContent ?? '').trim().toUpperCase())
    .filter((text) =>
      ['CHARACTERISTICS', 'SOCIAL', 'TRAITS', 'JOURNAL', 'STATS', 'FEATS', 'OPTIONS', 'SAVES'].includes(text),
    )
  const uniqueTabs = [...new Set(tabs)]
  const clone = sidebar.cloneNode(true) as HTMLElement
  clone.querySelectorAll('a, button, [role="button"], #menu, #story-menu').forEach((n) => n.remove())
  const raw = (clone.innerText ?? clone.textContent ?? '').replace(/\u00a0/g, ' ')
  const lines = raw
    .split(/\n+/)
    .map(clean)
    .filter(Boolean)
    .filter((line) => !/^[A-Z]?(Pain|Arousal|Fatigue|Stress|Trauma|Control|Allure)\s*[::]/i.test(line))
    .filter((line) => !/\d+\.\d{2}/.test(line))
  const body = lines.join(' | ').slice(0, 1500)
  return [uniqueTabs.length ? `[页签] ${uniqueTabs.join(' / ')}` : '', body ? `[侧栏] ${body}` : '']
    .filter(Boolean)
    .join('\n')
}

/** 左侧常驻状态：Pain / Arousal / Fatigue / Stress / Trauma / Control / Allure。 */
export function readVitals(doc: Document): string {
  const sidebar = doc.querySelector<HTMLElement>('#sidebar, #story-caption, .sidebar')
  if (!sidebar) return ''
  const clone = sidebar.cloneNode(true) as HTMLElement
  clone.querySelectorAll('a, button, [role="button"], #menu, #story-menu').forEach((n) => n.remove())
  const raw = (clone.innerText ?? clone.textContent ?? '').replace(/\u00a0/g, ' ')
  const labels = ['Pain', 'Arousal', 'Fatigue', 'Stress', 'Trauma', 'Control', 'Allure']
  const found: string[] = []
  for (const line of raw.split(/\n+/)) {
    const m = line.match(/^\s*(Pain|Arousal|Fatigue|Stress|Trauma|Control|Allure)\s*[::]\s*(.+)$/i)
    if (!m) continue
    const label = labels.find((l) => l.toLowerCase() === (m[1] ?? '').toLowerCase()) ?? m[1]
    const value = (m[2] ?? '').trim()
    if (value) found.push(`${label}: ${value}`)
  }
  return found.length ? `[状态] ${found.join(' | ')}` : ''
}

function content(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('#customOverlayContent, .customOverlayContent')
}

async function waitFor<T>(get: () => T | null, timeoutMs: number): Promise<T | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = get()
    if (value) return value
    await sleep(60)
  }
  return null
}

/**
 * 依次点开页面、读文本、关闭。
 * 返回带统计的文字（即使 0 页也返回原因），方便 Coo 判断是没打开还是抓取失败。
 */
export interface CaptureLimits {
  pageLimit?: number
  totalLimit?: number
}

export async function captureStatusPages(
  limits: CaptureLimits = {},
  doc: Document = document,
): Promise<string> {
  const open = overlay(doc)
  if (open && isVisible(open)) {
    return '[抓取] 0/4 页；原因：游戏里已有浮层打开，本次跳过，未打扰玩家'
  }

  const parts: string[] = []
  const failures: string[] = []

  for (const [name, label] of STATUS_PAGES) {
    const button = findButton(doc, name)
    if (!button) {
      failures.push(`${label}（未找到按钮）`)
      continue
    }
    button.click()
    const box = await waitFor(() => {
      const el = content(doc)
      if (!el || !isVisible(el)) return null
      const text = clean(el.textContent ?? '')
      return text.length >= 10 ? el : null
    }, 1500)
    if (!box) {
      failures.push(`${label}（页面未渲染或内容为空）`)
      continue
    }
    const text = clean(box.textContent ?? '').slice(0, 2200)
    parts.push(`[${label}] ${text}`)
    const close = doc.querySelector<HTMLElement>(
      '#customOverlayClose, .customOverlayClose, [data-overlay-close]',
    )
    close?.click()
    await sleep(80)
  }

  const header = `[抓取] ${parts.length}/${STATUS_PAGES.length} 页${
    failures.length ? `；未取到：${failures.join('；')}` : ''
  }`
  return [readVitals(doc), readSidebarText(doc), header, ...parts]
    .filter(Boolean)
    .join('\n')
    .slice(0, limits.totalLimit && limits.totalLimit > 0 ? limits.totalLimit : undefined)
}
