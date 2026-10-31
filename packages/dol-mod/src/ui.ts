/**
 * 游戏内 UI：单词卡、问句卡、生词/复习/设置面板。
 *
 * 约束：
 * - 只读游戏 DOM，不改正文结构（高亮用 CSS Highlight API，失败就算了）；
 * - 所有交互都在自己的浮层里，点不到游戏链接；
 * - 任何异常都吞掉并记一条诊断，不影响玩。
 */
import { lookup } from './dict.ts'
import { analyzeRoots } from './roots.ts'
import { formatRoots, VocabBook, type VocabEntry } from './vocab.ts'
import type { JsonCache } from './cache.ts'
import type { RootPart, SentencePayload, WordPayload } from './protocol.ts'
import { requestId } from './protocol.ts'
import { errorText } from './env.ts'
import { speakWord } from './speech.ts'
import { DEFAULT_SETTINGS, clampRate, type Settings } from './settings.ts'

export interface UiDeps {
  book: VocabBook
  sentenceCache: JsonCache<SentencePayload>
  wordCache: JsonCache<WordPayload>
  askSentence: (text: string) => string | null
  askWord: (word: string, sentence: string) => string | null
  notifyVocab: (op: 'add' | 'remove' | 'review', entry: Record<string, unknown>) => void
  /** 注入朗读实现（测试用）；省略时用系统语音合成。 */
  speak?: (text: string) => void
  settings?: Settings
  saveSettings?: (settings: Settings) => void
  connected: () => boolean
  reconnect: () => void
}

interface WordView {
  word: string
  lemma: string
  phonetic?: string
  pos?: string
  gloss: string
  roots?: RootPart[]
  family?: string[]
  source: 'local' | 'coo' | 'ai'
  sentence: string
}

type CardState =
  | { kind: 'word'; view: WordView; missing?: boolean }
  | { kind: 'sentence'; text: string; payload: SentencePayload | null; status: 'loading' | 'error' | 'ready' }

export class Ui {
  private readonly deps: UiDeps
  private settings: Settings
  private readonly logLines: string[] = []

  private badge!: HTMLButtonElement
  private panel!: HTMLDivElement
  private card!: HTMLDivElement
  private tab: 'vocab' | 'review' | 'settings' = 'vocab'
  private current: CardState | null = null
  private pendingId: string | null = null
  private anchor = { x: 0, y: 0 }

  constructor(deps: UiDeps) {
    this.deps = deps
    this.settings = deps.settings ?? { ...DEFAULT_SETTINGS }
  }

  mount(): void {
    this.mountBadge()
    this.mountPanel()
    this.mountCard()
    this.bindGameClicks()
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') this.closeCard()
    })
    document.addEventListener('mousedown', (ev) => {
      const t = ev.target as Node | null
      if (!t) return
      if (this.card.contains(t) || this.panel.contains(t) || this.badge.contains(t)) return
      this.closeCard()
    })
  }

  setStatus(status: string): void {
    if (!this.badge) return
    this.badge.dataset['status'] = status
    this.badge.title = `CooBridge：${status}（点击打开面板）`
    const dot = this.panel?.querySelector('[data-role="status"]')
    if (dot) dot.textContent = status
  }

  log(message: string): void {
    const line = `${new Date().toLocaleTimeString()} ${message}`
    this.logLines.push(line)
    if (this.logLines.length > 50) this.logLines.shift()
    const box = this.panel?.querySelector('[data-role="log"]')
    if (box) box.textContent = this.logLines.join('\n')
  }

  /** 短暂提示：版本不匹配、Coo 不可用、连接失败这类。 */
  toast(text: string, bad = false): void {
    if (!document.body) return
    const el = document.createElement('div')
    el.className = `cb-toast${bad ? ' bad' : ''}`
    el.textContent = text
    document.body.append(el)
    window.setTimeout(() => el.remove(), 4200)
    this.log(text)
  }

  onReply(id: string, kind: 'sentence' | 'word', payload: unknown): void {
    if (id !== this.pendingId) return
    this.pendingId = null
    if (kind === 'sentence') {
      const data = payload as SentencePayload
      this.deps.sentenceCache.set(id, data)
      if (this.current?.kind === 'sentence') {
        this.current = { ...this.current, payload: data, status: 'ready' }
        this.renderCurrent()
      }
      return
    }
    const data = payload as WordPayload
    this.deps.wordCache.set(id, data)
    if (this.current?.kind === 'word') {
      const view: WordView = {
        word: data.lemma,
        lemma: data.lemma,
        gloss: data.gloss,
        source: data.source,
        sentence: this.current.view.sentence,
        ...(data.phonetic ? { phonetic: data.phonetic } : {}),
        ...(data.pos ? { pos: data.pos } : {}),
        ...(data.roots ? { roots: data.roots } : {}),
        ...(data.family ? { family: data.family } : {}),
      }
      this.current = { kind: 'word', view }
      this.renderCurrent()
    }
  }

  /** World 回的是失败（超时 / Coo 不在线）：把卡片从「正在想」里救出来。 */
  onReplyFailed(id: string, code: string): void {
    if (id !== this.pendingId) return
    this.pendingId = null
    const message = errorText(code, '')
    this.toast(message, true)
    if (!this.current) return

    if (this.current.kind === 'sentence') {
      this.current = { kind: 'sentence', text: this.current.text, payload: null, status: 'error' }
      this.renderCurrent()
      return
    }

    this.current = {
      kind: 'word',
      view: { ...this.current.view, gloss: 'Coo 没来得及回答' },
      missing: true,
    }
    this.renderCurrent()
  }

  // ── 游戏内点击 ──────────────────────────────────────────────────────────

  private bindGameClicks(): void {
    const passages = document.querySelector('#passages')
    if (!passages) {
      window.setTimeout(() => this.bindGameClicks(), 2000)
      return
    }
    passages.addEventListener('click', (ev) => {
      try {
        const e = ev as MouseEvent
        const target = e.target as HTMLElement | null
        if (target?.closest('a')) return
        if (e.altKey) {
          if (this.settings.altSentence) this.openSentenceAt(e.clientX, e.clientY)
          return
        }
        if (!this.settings.wordCard) return
        const hit = this.wordAt(e.clientX, e.clientY)
        if (!hit) return
        this.openWord(hit.word, hit.sentence, e.clientX, e.clientY)
      } catch (err) {
        this.log(`点词失败：${String(err)}`)
      }
    })

    document.addEventListener('mouseup', (ev) => {
      try {
        const e = ev as MouseEvent
        if (e.altKey) return
        if (!this.settings.altSentence) return
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) return
        const text = sel.toString().replace(/\s+/g, ' ').trim()
        if (text.length < 8 || text.length > 400) return
        if (!passages.contains(sel.anchorNode ?? null)) return
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        this.showSentence(text, rect.left, rect.bottom)
      } catch {
        /* 选区失败忽略 */
      }
    })
  }

  private wordAt(x: number, y: number): { word: string; sentence: string } | null {
    const range = rangeFromPoint(x, y)
    const node = range?.startContainer
    if (!node || node.nodeType !== Node.TEXT_NODE) return null
    const text = node.textContent ?? ''
    const offset = range?.startOffset ?? 0
    const bounds = wordBounds(text, offset)
    if (!bounds) return null
    const word = text.slice(bounds.start, bounds.end)
    const sentence = sentenceAround(text, bounds.start, bounds.end) ?? text.trim()
    return { word, sentence }
  }

  private openSentenceAt(x: number, y: number): void {
    const range = rangeFromPoint(x, y)
    const node = range?.startContainer
    if (!node || node.nodeType !== Node.TEXT_NODE) return
    const text = node.textContent ?? ''
    const offset = range?.startOffset ?? 0
    const sentence = sentenceAround(text, offset, offset) ?? text.trim()
    if (sentence.length < 3) return
    this.showSentence(sentence, x, y)
  }

  // ── 卡片 ────────────────────────────────────────────────────────────────

  private openWord(word: string, sentence: string, x: number, y: number): void {
    const hit = lookup(word)
    if (hit) {
      const roots = analyzeRoots(hit.lemma)
      const view: WordView = {
        word: hit.word,
        lemma: hit.lemma,
        gloss: hit.entry.gloss,
        source: 'local',
        sentence,
        ...(hit.entry.phonetic ? { phonetic: hit.entry.phonetic } : {}),
        ...(hit.entry.pos ? { pos: hit.entry.pos } : {}),
        ...(roots ? { roots: roots.parts, family: roots.family } : {}),
      }
      this.current = { kind: 'word', view }
      this.renderCurrent()
      this.positionAt(x, y)
      return
    }

    // 本地没收录：先给已有 AI 结果，否则提示问 Coo
    const id = requestId('w', `${word}|${sentence}`)
    const cached = this.deps.wordCache.get(id)
    if (cached) {
      this.current = {
        kind: 'word',
        view: {
          word: word,
          lemma: cached.lemma,
          gloss: cached.gloss,
          source: cached.source,
          sentence,
          ...(cached.phonetic ? { phonetic: cached.phonetic } : {}),
          ...(cached.pos ? { pos: cached.pos } : {}),
          ...(cached.roots ? { roots: cached.roots } : {}),
          ...(cached.family ? { family: cached.family } : {}),
        },
      }
      this.renderCurrent()
      this.positionAt(x, y)
      return
    }

    this.current = {
      kind: 'word',
      view: { word, lemma: word, gloss: '', source: 'coo', sentence },
      missing: true,
    }
    this.renderCurrent()
    this.positionAt(x, y)
  }

  private showSentence(text: string, x: number, y: number): void {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (clean.length < 2) return
    const id = requestId('s', clean)
    const cached = this.deps.sentenceCache.get(id)
    if (cached) {
      this.current = { kind: 'sentence', text: clean, payload: cached, status: 'ready' }
      this.renderCurrent()
      this.positionAt(x, y)
      return
    }
    this.current = { kind: 'sentence', text: clean, payload: null, status: 'loading' }
    this.pendingId = id
    this.renderCurrent()
    this.positionAt(x, y)
    const sent = this.deps.askSentence(clean)
    if (!sent) {
      this.pendingId = null
      this.current = { kind: 'sentence', text: clean, payload: null, status: 'error' }
      this.renderCurrent()
      this.log('问句失败：Coo 未连接')
    }
  }

  private askWord(): void {
    if (this.current?.kind !== 'word') return
    const view = this.current.view
    const id = requestId('w', `${view.word}|${view.sentence}`)
    this.pendingId = id
    const sent = this.deps.askWord(view.word, view.sentence)
    if (!sent) {
      this.pendingId = null
      this.log('查词失败：Coo 未连接')
      this.setSentenceError()
      return
    }
    this.current = { kind: 'word', view: { ...view, gloss: 'Coo 正在想…', source: 'coo' } }
    this.renderCurrent()
  }

  private retrySentence(): void {
    if (this.current?.kind !== 'sentence') return
    const text = this.current.text
    this.pendingId = requestId('s', text)
    this.current = { kind: 'sentence', text, payload: null, status: 'loading' }
    this.renderCurrent()
    if (!this.deps.askSentence(text)) {
      this.pendingId = null
      this.current = { kind: 'sentence', text, payload: null, status: 'error' }
      this.renderCurrent()
    }
  }

  private setSentenceError(): void {
    if (this.current?.kind !== 'word') return
    this.current = {
      kind: 'word',
      view: { ...this.current.view, gloss: 'Coo 没连上' },
      missing: true,
    }
    this.renderCurrent()
  }

  private renderCurrent(): void {
    const state = this.current
    if (!state) {
      this.card.hidden = true
      return
    }
    this.card.hidden = false
    this.card.replaceChildren()

    if (state.kind === 'word') {
      const v = state.view

      const head = document.createElement('div')
      head.className = 'cb-word-head'
      const wordEl = row('cb-word', `${v.word}${v.lemma !== v.word ? ` → ${v.lemma}` : ''}`)
      const speakBtn = document.createElement('button')
      speakBtn.type = 'button'
      speakBtn.className = 'cb-speak'
      speakBtn.title = '朗读这个单词'
      speakBtn.setAttribute('aria-label', '朗读')
      speakBtn.textContent = '🔊'
      speakBtn.addEventListener('click', (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        if (this.deps.speak) {
          this.deps.speak(v.lemma)
          return
        }
        const result = speakWord(v.lemma, { rate: this.settings.rate })
        if (result === 'unsupported') this.toast('当前环境不支持朗读（系统没有可用的语音合成）', true)
      })
      head.append(wordEl)
      if (this.settings.speak) head.append(speakBtn)

      this.card.append(
        head,
        ...(v.phonetic ? [row('cb-phon', `/${v.phonetic}/`)] : []),
        ...(v.pos ? [row('cb-pos', v.pos)] : []),
        ...(v.gloss ? [row('cb-gloss', v.gloss)] : []),
      )

      if (state.missing) {
        const btn = button('问 Coo 这个词', () => this.askWord())
        this.card.append(actions(btn))
        this.card.append(row('cb-source', '本地词典未收录'))
        return
      }

      if (v.roots?.length) {
        this.card.append(row('cb-roots', formatRoots(v.roots)))
      } else {
        this.card.append(row('cb-roots cb-muted', '无可靠词根'))
      }
      if (v.family?.length) {
        this.card.append(row('cb-family', `同根：${v.family.join(' / ')}`))
      }
      this.card.append(row('cb-source', v.source === 'local' ? '来源：本地词典' : '来源：AI 推测（Coo）'))

      const added = this.deps.book.find(v.lemma)
      const addBtn = button(added ? '已在生词本' : '加入生词本', () => {
        const { entry } = this.deps.book.add({
          word: v.word,
          lemma: v.lemma,
          gloss: v.gloss,
          source: v.source === 'local' ? 'local' : 'coo',
          sentence: v.sentence,
          ...(v.phonetic ? { phonetic: v.phonetic } : {}),
          ...(v.pos ? { pos: v.pos } : {}),
          ...(v.roots ? { roots: v.roots } : {}),
          ...(v.family ? { family: v.family } : {}),
        })
        this.deps.notifyVocab('add', {
          word: entry.word,
          lemma: entry.lemma,
          gloss: entry.gloss,
          dueAt: entry.srs.dueAt,
          box: entry.srs.box,
          addedAt: entry.addedAt,
          ...(entry.phonetic ? { phonetic: entry.phonetic } : {}),
          ...(entry.pos ? { pos: entry.pos } : {}),
        })
        addBtn.textContent = '已加入'
        addBtn.disabled = true
        this.refreshPanel()
      })
      if (added) addBtn.disabled = true
      const askBtn = button('问 Coo 这句', () => {
        this.showSentence(v.sentence, this.anchor.x, this.anchor.y)
      })
      this.card.append(actions(addBtn, askBtn))
      return
    }

    const s = state
    this.card.append(row('cb-sent-en', `“${s.text}”`))
    if (s.status === 'loading') {
      this.card.append(row('cb-loading', 'Coo 正在想…'))
      return
    }
    if (s.status === 'error' || !s.payload) {
      this.card.append(row('cb-loading', '没等到 Coo 的回答'))
      this.card.append(actions(button('重试', () => this.retrySentence())))
      return
    }
    this.card.append(row('cb-trans', s.payload.translation))
    if (s.payload.notes.length) {
      const list = document.createElement('ul')
      list.className = 'cb-notes'
      for (const note of s.payload.notes.slice(0, 3)) {
        const li = document.createElement('li')
        li.textContent = note
        list.append(li)
      }
      this.card.append(list)
    }
    this.card.append(row('cb-source', '来源：Coo'))
  }

  private positionAt(x: number, y: number): void {
    this.anchor = { x, y }
    const pad = 12
    const rect = this.card.getBoundingClientRect()
    let left = x + pad
    let top = y + pad
    if (left + rect.width > window.innerWidth - 8) left = Math.max(8, x - rect.width - pad)
    if (top + rect.height > window.innerHeight - 8) top = Math.max(8, y - rect.height - pad)
    this.card.style.left = `${left}px`
    this.card.style.top = `${top}px`
  }

  private closeCard(): void {
    this.current = null
    this.pendingId = null
    if (this.card) this.card.hidden = true
  }

  // ── 面板 ────────────────────────────────────────────────────────────────

  private mountBadge(): void {
    const btn = document.createElement('button')
    btn.id = 'cb-badge'
    btn.type = 'button'
    btn.textContent = 'Coo'
    btn.addEventListener('click', () => this.togglePanel())
    document.body.append(btn)
    this.badge = btn
  }

  private mountPanel(): void {
    const panel = document.createElement('div')
    panel.id = 'cb-panel'
    panel.hidden = true
    panel.innerHTML = `
      <header class="cb-panel-head">
        <span class="cb-panel-title">DoL 陪读</span>
        <span class="cb-panel-status" data-role="status">offline</span>
        <button type="button" class="cb-x" data-act="close">×</button>
      </header>
      <nav class="cb-tabs">
        <button type="button" data-tab="vocab" class="on">生词</button>
        <button type="button" data-tab="review">复习</button>
        <button type="button" data-tab="settings">设置</button>
      </nav>
      <div class="cb-body">
        <section data-panel="vocab"></section>
        <section data-panel="review" hidden></section>
        <section data-panel="settings" hidden></section>
      </div>
    `
    document.body.append(panel)
    this.panel = panel

    panel.querySelector('[data-act="close"]')?.addEventListener('click', () => this.togglePanel(false))
    panel.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = (btn as HTMLElement).dataset['tab'] as 'vocab' | 'review' | 'settings'
        this.tab = tab
        panel.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b === btn))
        panel.querySelectorAll('[data-panel]').forEach((sec) => {
          ;(sec as HTMLElement).hidden = (sec as HTMLElement).dataset['panel'] !== tab
        })
        this.refreshPanel()
      })
    })
  }

  private mountCard(): void {
    const card = document.createElement('div')
    card.id = 'cb-card'
    card.hidden = true
    document.body.append(card)
    this.card = card
  }

  private togglePanel(force?: boolean): void {
    if (!this.panel) return
    const next = force ?? this.panel.hidden
    this.panel.hidden = !next
    if (next) this.refreshPanel()
  }

  private refreshPanel(): void {
    if (!this.panel || this.panel.hidden) return
    const sec = this.panel.querySelector(`[data-panel="${this.tab}"]`)
    if (!sec) return
    sec.replaceChildren()
    if (this.tab === 'vocab') this.renderVocab(sec)
    else if (this.tab === 'review') this.renderReview(sec)
    else this.renderSettings(sec)
  }

  private renderVocab(root: Element): void {
    const list = this.deps.book.list()
    const stats = this.deps.book.stats()
    root.append(row('cb-summary', `共 ${stats.total} 词 · 到期 ${stats.due} · 已掌握 ${stats.mastered}`))
    if (list.length === 0) {
      root.append(row('cb-muted', '还没有生词。在游戏里点一个词，加入生词本。'))
      return
    }
    const wrap = document.createElement('div')
    wrap.className = 'cb-list'
    for (const entry of list.slice().reverse()) {
      const item = document.createElement('div')
      item.className = 'cb-item'
      const main = document.createElement('button')
      main.type = 'button'
      main.className = 'cb-item-main'
      main.innerHTML = `<b></b><span class="cb-item-gloss"></span>`
      const b = main.querySelector('b')
      const g = main.querySelector('.cb-item-gloss')
      if (b) b.textContent = entry.lemma
      if (g) g.textContent = entry.gloss
      main.addEventListener('click', () => {
        this.openEntry(entry)
      })
      const del = document.createElement('button')
      del.type = 'button'
      del.className = 'cb-item-del'
      del.textContent = '删'
      del.addEventListener('click', () => {
        this.deps.book.remove(entry.lemma)
        this.deps.notifyVocab('remove', { lemma: entry.lemma })
        this.refreshPanel()
      })
      item.append(main, del)
      wrap.append(item)
    }
    root.append(wrap)
  }

  private renderReview(root: Element): void {
    const due = this.deps.book.due()
    root.append(row('cb-summary', `今天到期 ${due.length} 个`))
    if (due.length === 0) {
      root.append(row('cb-muted', '没有到期的词。去玩一会儿，遇到生词再加。'))
      return
    }
    for (const entry of due.slice(0, 20)) {
      const card = document.createElement('div')
      card.className = 'cb-review'
      card.append(row('cb-review-word', entry.lemma))
      if (entry.phonetic) card.append(row('cb-phon', `/${entry.phonetic}/`))
      const reveal = document.createElement('button')
      reveal.type = 'button'
      reveal.className = 'cb-mini'
      reveal.textContent = '看释义'
      reveal.addEventListener('click', () => {
        const d = document.createElement('div')
        d.className = 'cb-review-gloss'
        d.textContent = entry.gloss
        card.append(d)
        reveal.remove()
      })
      const btns = document.createElement('div')
      btns.className = 'cb-actions'
      for (const [label, grade] of [
        ['认识', 'good'],
        ['模糊', 'hard'],
        ['不认识', 'again'],
      ] as const) {
        const b = button(label, () => {
          const updated = this.deps.book.grade(entry.lemma, grade)
          if (updated) {
            this.deps.notifyVocab('review', {
              lemma: updated.lemma,
              dueAt: updated.srs.dueAt,
              box: updated.srs.box,
            })
          }
          this.refreshPanel()
        })
        btns.append(b)
      }
      card.append(reveal, btns)
      root.append(card)
    }
  }

  /** 自检数据：让玩家（或我）一眼看出是哪一层没接上。 */
  diagnostics(): Record<string, string> {
    const passages = document.querySelector('#passages') as HTMLElement | null
    return {
      modLoader: window.modUtils ? 'yes' : 'no',
      jquery: window.jQuery ? 'yes' : 'no',
      passage: String(window.State?.passage ?? '(none)'),
      passagesNode: passages ? 'found' : 'missing',
      textLength: String(passages?.innerText?.length ?? 0),
      choices: String(document.querySelectorAll('#passages a.link-internal, #passages a[data-passage]').length),
      connected: this.deps.connected() ? 'yes' : 'no',
      vocab: String(this.deps.book.list().length),
    }
  }

  /** 一键复制的诊断文本：自检 + 最近日志。 */
  diagnosticText(): string {
    const lines = Object.entries(this.diagnostics()).map(([key, value]) => `${key}: ${value}`)
    lines.push('', '--- log ---', ...this.logLines.slice(-20))
    return lines.join('\n')
  }

  /** 外部（例如 Coo 改了词库）后刷新面板。 */
  refresh(): void {
    this.refreshPanel()
  }

  private settingsControls(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cb-settings'

    const toggle = (label: string, key: 'wordCard' | 'altSentence' | 'speak'): void => {
      const line = document.createElement('label')
      line.className = 'cb-setting'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = this.settings[key]
      input.addEventListener('change', () => {
        const next = { ...this.settings }
        if (key === 'wordCard') next.wordCard = input.checked
        else if (key === 'altSentence') next.altSentence = input.checked
        else next.speak = input.checked
        this.settings = next
        this.deps.saveSettings?.(next)
      })
      const text = document.createElement('span')
      text.textContent = label
      line.append(input, text)
      wrap.append(line)
    }

    toggle('点词查义', 'wordCard')
    toggle('Alt+点击 / 选中问句', 'altSentence')
    toggle('单词卡显示朗读', 'speak')

    const rateLine = document.createElement('label')
    rateLine.className = 'cb-setting cb-setting-rate'
    const rateLabel = document.createElement('span')
    rateLabel.textContent = '朗读语速'
    const input = document.createElement('input')
    input.type = 'range'
    input.min = '0.6'
    input.max = '1.3'
    input.step = '0.05'
    input.value = String(this.settings.rate)
    const output = document.createElement('output')
    output.textContent = this.settings.rate.toFixed(2)
    input.addEventListener('input', () => {
      const rate = clampRate(Number(input.value))
      this.settings = { ...this.settings, rate }
      output.textContent = rate.toFixed(2)
      this.deps.saveSettings?.(this.settings)
    })
    rateLine.append(rateLabel, input, output)
    wrap.append(rateLine)
    return wrap
  }

  private renderSettings(root: Element): void {
    root.append(row('cb-summary', `连接：${this.deps.connected() ? '已连接' : '未连接'}`))
    root.append(this.settingsControls())

    const diag = this.diagnostics()
    const table = document.createElement('div')
    table.className = 'cb-diag'
    for (const [key, value] of Object.entries(diag)) {
      const line = row('cb-diag-line', `${key}: ${value}`)
      table.append(line)
    }
    root.append(row('cb-muted', '自检'), table)

    const reconnect = button('重新连接', () => this.deps.reconnect())
    const copyDiag = button('复制自检', () => {
      const text = this.diagnosticText()
      void navigator.clipboard?.writeText(text).catch(() => {})
      this.log('自检已复制')
    })
    const exportJson = button('导出 JSON', () => download('coobridge-vocab.json', this.deps.book.toJson(), 'application/json'))
    const exportCsv = button('导出 CSV', () => download('coobridge-vocab.csv', `\ufeff${this.deps.book.toCsv()}`, 'text/csv'))
    const clearCache = button('清空翻译缓存', () => {
      this.deps.sentenceCache.clear()
      this.deps.wordCache.clear()
      this.log('翻译缓存已清空')
    })
    root.append(actions(reconnect, copyDiag, exportJson, exportCsv, clearCache))
    root.append(row('cb-muted', '模式（主动/触发/被动）在 Coopanion 的 DoL 陪读设置里改。'))
    const log = document.createElement('pre')
    log.className = 'cb-log'
    log.dataset['role'] = 'log'
    log.textContent = this.logLines.join('\n')
    root.append(row('cb-muted', '诊断（最近 50 条）'), log)
  }

  private openEntry(entry: VocabEntry): void {
    this.current = {
      kind: 'word',
      view: {
        word: entry.word,
        lemma: entry.lemma,
        gloss: entry.gloss,
        source: entry.source,
        sentence: entry.sentence ?? '',
        ...(entry.phonetic ? { phonetic: entry.phonetic } : {}),
        ...(entry.pos ? { pos: entry.pos } : {}),
        ...(entry.roots ? { roots: entry.roots } : {}),
        ...(entry.family ? { family: entry.family } : {}),
      },
    }
    this.renderCurrent()
    this.positionAt(window.innerWidth / 2 - 160, window.innerHeight / 2 - 120)
  }
}

// ── DOM 小工具 ────────────────────────────────────────────────────────────

function row(cls: string, text: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = cls
  el.textContent = text
  return el
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'cb-btn'
  b.textContent = label
  b.addEventListener('click', (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    onClick()
  })
  return b
}

function actions(...children: HTMLElement[]): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = 'cb-actions'
  wrap.append(...children)
  return wrap
}

function rangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  if (typeof doc.caretRangeFromPoint === 'function') return doc.caretRangeFromPoint(x, y)
  if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(x, y)
    if (!pos) return null
    const range = document.createRange()
    range.setStart(pos.offsetNode, pos.offset)
    range.setEnd(pos.offsetNode, pos.offset)
    return range
  }
  return null
}

function wordBounds(text: string, offset: number): { start: number; end: number } | null {
  const isWord = (c: string): boolean => /[A-Za-z'’-]/.test(c)
  let start = Math.min(offset, text.length)
  let end = start
  while (start > 0 && isWord(text[start - 1] ?? '')) start--
  while (end < text.length && isWord(text[end] ?? '')) end++
  const word = text.slice(start, end)
  if (word.replace(/[^A-Za-z]/g, '').length < 2) return null
  return { start, end }
}

function sentenceAround(text: string, start: number, end: number): string | null {
  const isStop = (c: string): boolean => '.!?…'.includes(c)
  let left = start
  while (left > 0) {
    const c = text[left - 1] ?? ''
    if (isStop(c)) break
    if (left < start - 400) break
    left--
  }
  let right = end
  while (right < text.length) {
    const c = text[right] ?? ''
    if (isStop(c)) {
      right++
      break
    }
    if (right > end + 400) break
    right++
  }
  const out = text.slice(left, right).replace(/\s+/g, ' ').trim()
  return out.length >= 2 ? out : null
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
