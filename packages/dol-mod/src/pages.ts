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

function findButton(doc: ParentNode, name: string): HTMLElement | null {
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('button, a, [role="button"]'))) {
    const text = (el.textContent ?? '').trim().toUpperCase()
    if (text === name || text.startsWith(`${name} `)) return el
  }
  return null
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
 * 依次点开页面、读文本、关闭。游戏里已有浮层时直接放弃，避免打断玩家。
 * 返回 null 表示这次没抓成（不重试）。
 */
export async function captureStatusPages(doc: Document = document): Promise<string | null> {
  if (doc.querySelector('#customOverlay, .customOverlay')) return null
  const parts: string[] = []
  for (const [name, label] of STATUS_PAGES) {
    const button = findButton(doc, name)
    if (!button) continue
    button.click()
    const content = await waitFor(
      () => doc.querySelector<HTMLElement>('#customOverlayContent, .customOverlayContent'),
      1200,
    )
    if (!content) continue
    const text = clean(content.textContent ?? '').slice(0, 1200)
    if (text) parts.push(`[${label}] ${text}`)
    const close = doc.querySelector<HTMLElement>('#customOverlayClose, .customOverlayClose')
    close?.click()
    await sleep(80)
  }
  return parts.length > 0 ? parts.join('\n').slice(0, 4500) : null
}
