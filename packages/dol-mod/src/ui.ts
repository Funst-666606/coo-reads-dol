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
import { importVocab, parseVocabText } from './vocab-io.ts'
import { describePassageRoot, resolvePassageRoot } from './scene.ts'

export interface UiDeps {
  book: VocabBook
  sentenceCache: JsonCache<SentencePayload>
  wordCache: JsonCache<WordPayload>
  askSentence: (text: string) => string | null
  askWord: (word: string, sentence: string) => string | null
  notifyVocab: (op: 'add' | 'remove' | 'review' | 'mastered', entry: Record<string, unknown>) => void
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
  | {
      kind: 'word'
      word: string
      sentence: string
      local: WordView | null
      coo: WordView | null
      pending: boolean
    }
  | { kind: 'sentence'; text: string; payload: SentencePayload | null; status: 'loading' | 'error' | 'ready' }

export class Ui {
  private readonly deps: UiDeps
  private settings: Settings
  private readonly logLines: string[] = []

  private badge!: HTMLButtonElement
  private panel!: HTMLDivElement
  private card!: HTMLDivElement
  private tab: 'vocab' | 'review' | 'settings' = 'vocab'
  private vocabFilter: 'all' | 'coo' = 'all'
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
      const state = this.current
      this.current = { ...state, coo: this.viewFromPayload(data, state.word, state.sentence), pending: false }
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

    this.current = { ...this.current, pending: false }
    this.renderCurrent()
  }

  // ── 游戏内点击 ──────────────────────────────────────────────────────────

  private bindGameClicks(): void {
    // 容器可能被框架换掉（原版 #passages，MapleBirch #passage-content），所以代理到 document，
    // 每次事件时再解析当前正文容器。
    document.addEventListener('click', (ev) => {
      try {
        const e = ev as MouseEvent
        const target = e.target as HTMLElement | null
        if (!target) return
        // 本模组自己的浮层、以及游戏里的链接/按钮/输入框都不处理
        if (isOwnUi(target) || isInteractive(target)) return
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
        const anchorEl =
          sel.anchorNode?.nodeType === Node.ELEMENT_NODE
            ? (sel.anchorNode as HTMLElement)
            : sel.anchorNode?.parentElement
        if (!anchorEl || isOwnUi(anchorEl) || isInteractive(anchorEl)) return
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
    const local = hit ? this.localView(hit, sentence) : null

    const id = requestId('w', `${word}|${sentence}`)
    const cached = this.deps.wordCache.get(id)
    const coo = cached ? this.viewFromPayload(cached, word, sentence) : null

    this.current = { kind: 'word', word, sentence, local, coo, pending: false }
    this.renderCurrent()
    this.positionAt(x, y)
  }

  private localView(hit: NonNullable<ReturnType<typeof lookup>>, sentence: string): WordView {
    const roots = analyzeRoots(hit.lemma)
    return {
      word: hit.word,
      lemma: hit.lemma,
      gloss: hit.entry.gloss,
      source: 'local',
      sentence,
      ...(hit.entry.phonetic ? { phonetic: hit.entry.phonetic } : {}),
      ...(hit.entry.pos ? { pos: hit.entry.pos } : {}),
      ...(roots ? { roots: roots.parts, family: roots.family } : {}),
    }
  }

  private viewFromPayload(data: WordPayload, word: string, sentence: string): WordView {
    return {
      word,
      lemma: data.lemma,
      gloss: data.gloss,
      source: data.source,
      sentence,
      ...(data.phonetic ? { phonetic: data.phonetic } : {}),
      ...(data.pos ? { pos: data.pos } : {}),
      ...(data.roots ? { roots: data.roots } : {}),
      ...(data.family ? { family: data.family } : {}),
    }
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
    const state = this.current
    if (!state || state.kind !== 'word') return
    const id = requestId('w', `${state.word}|${state.sentence}`)
    this.pendingId = id
    const sent = this.deps.askWord(state.word, state.sentence)
    if (!sent) {
      this.pendingId = null
      this.toast('Coo 未连接，问不了这个词', true)
      return
    }
    this.current = { ...state, pending: true }
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

  /** 单词卡的「本地词典 / Coo 补充」共用一个块。 */
  private appendWordBlock(view: WordView, label: string): void {
    this.card.append(row('cb-block-label', label))
    if (view.phonetic) this.card.append(row('cb-phon', `/${view.phonetic}/`))
    if (view.pos) this.card.append(row('cb-pos', view.pos))
    if (view.gloss) this.card.append(row('cb-gloss', view.gloss))
    if (view.roots?.length) this.card.append(row('cb-roots', formatRoots(view.roots)))
    else this.card.append(row('cb-roots cb-muted', '无可靠词根'))
    if (view.family?.length) this.card.append(row('cb-family', `同根：${view.family.join(' / ')}`))
    this.card.append(row('cb-source', view.source === 'local' ? '来源：本地词典' : '来源：AI 推测（Coo）'))
  }

  private notifyEntry(op: 'add' | 'remove' | 'review' | 'mastered', entry: VocabEntry): void {
    this.deps.notifyVocab(op, {
      word: entry.word,
      lemma: entry.lemma,
      gloss: entry.gloss,
      dueAt: entry.srs.dueAt,
      box: entry.srs.box,
      addedAt: entry.addedAt,
      ...(entry.phonetic ? { phonetic: entry.phonetic } : {}),
      ...(entry.pos ? { pos: entry.pos } : {}),
    })
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
      const local = state.local
      const coo = state.coo
      const primary = local ?? coo
      const lemma = primary?.lemma ?? state.word

      const head = document.createElement('div')
      head.className = 'cb-word-head'
      const label = primary ? `${primary.word}${primary.lemma !== primary.word ? ` → ${primary.lemma}` : ''}` : state.word
      head.append(row('cb-word', label))

      if (this.settings.speak) {
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
            this.deps.speak(lemma)
            return
          }
          const result = speakWord(lemma, { rate: this.settings.rate })
          if (result === 'unsupported') this.toast('当前环境不支持朗读（系统没有可用的语音合成）', true)
        })
        head.append(speakBtn)
      }
      this.card.append(head)

      if (local) this.appendWordBlock(local, '本地词典')
      if (coo) this.appendWordBlock(coo, 'Coo 补充（AI 推测）')
      if (state.pending) this.card.append(row('cb-loading', 'Coo 正在想…'))
      else if (!local && !coo) this.card.append(row('cb-muted', '本地词典未收录'))

      const buttons: HTMLButtonElement[] = []

      const shown = primary
      if (shown) {
        const existing = this.deps.book.find(shown.lemma)
        const addBtn = button(existing ? '已在生词本' : '加入生词本', () => {
          const { entry } = this.deps.book.add({
            word: shown.word,
            lemma: shown.lemma,
            gloss: shown.gloss,
            source: shown.source === 'local' ? 'local' : 'coo',
            sentence: shown.sentence,
            ...(shown.phonetic ? { phonetic: shown.phonetic } : {}),
            ...(shown.pos ? { pos: shown.pos } : {}),
            ...(shown.roots ? { roots: shown.roots } : {}),
            ...(shown.family ? { family: shown.family } : {}),
          })
          this.notifyEntry('add', entry)
          addBtn.textContent = '已加入'
          addBtn.disabled = true
          this.refreshPanel()
        })
        if (existing) addBtn.disabled = true
        buttons.push(addBtn)

        // 本地与 Coo 都有、且已经在生词本里：允许用 Coo 的释义覆盖
        if (local && coo && existing) {
          buttons.push(
            button('用 Coo 的释义更新', () => {
              const updated = this.deps.book.update(lemma, {
                gloss: coo.gloss,
                source: 'coo',
                ...(coo.phonetic ? { phonetic: coo.phonetic } : {}),
                ...(coo.pos ? { pos: coo.pos } : {}),
                ...(coo.roots ? { roots: coo.roots } : {}),
                ...(coo.family ? { family: coo.family } : {}),
              })
              if (updated) {
                const marked = this.deps.book.markCoo(updated.lemma) ?? updated
                this.notifyEntry('add', marked)
                this.toast('已用 Coo 的释义更新生词本', false)
                this.refreshPanel()
              }
            }),
          )
        }
      }

      buttons.push(
        button(coo ? '再问一次 Coo' : '问 Coo 这个词', () => this.askWord()),
        button('问 Coo 这句', () => this.showSentence(state.sentence, this.anchor.x, this.anchor.y)),
      )
      this.card.append(actions(...buttons))
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
    btn.textContent = 'Coo ⚙'
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
    const all = this.deps.book.list()
    const cooCount = all.filter((e) => e.source === 'coo' || e.cooUpdatedAt).length
    const list = this.vocabFilter === 'coo' ? all.filter((e) => e.source === 'coo' || e.cooUpdatedAt) : all
    const stats = this.deps.book.stats()
    root.append(row('cb-summary', `共 ${stats.total} 词 · 到期 ${stats.due} · 已掌握 ${stats.mastered} · Coo 改动 ${cooCount}`))
    root.append(this.vocabToolbar())

    if (list.length === 0) {
      root.append(
        row('cb-muted', this.vocabFilter === 'coo' ? 'Coo 还没有新增或改动过词。' : '还没有生词。点游戏里的词加入，或手动添加 / 导入。'),
      )
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
      if (b) {
        b.textContent = entry.lemma
        if (entry.source === 'coo' || entry.cooUpdatedAt) {
          const tag = document.createElement('span')
          tag.className = 'cb-tag'
          tag.textContent = 'Coo'
          b.append(tag)
        }
      }
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
      const edit = document.createElement('button')
      edit.type = 'button'
      edit.className = 'cb-item-del'
      edit.textContent = '改'
      edit.addEventListener('click', () => this.showEntryEditor(item, entry))
      item.append(main, edit, del)
      wrap.append(item)
    }
    root.append(wrap)
  }

  private vocabToolbar(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cb-toolbar'
    wrap.append(
      button('手动添加', () => this.showManualAdd(wrap)),
      button('导入词库', () => this.pickImportFile()),
      button(this.vocabFilter === 'coo' ? '显示全部' : '只看 Coo 改动', () => {
        this.vocabFilter = this.vocabFilter === 'coo' ? 'all' : 'coo'
        this.refreshPanel()
      }),
    )
    return wrap
  }

  private showManualAdd(host: HTMLElement): void {
    const editor = document.createElement('div')
    editor.className = 'cb-editor'
    const word = document.createElement('input')
    word.className = 'cb-input'
    word.placeholder = '单词'
    const gloss = document.createElement('input')
    gloss.className = 'cb-input'
    gloss.placeholder = '中文释义'
    const save = button('保存', () => {
      const w = word.value.trim()
      const g = gloss.value.trim()
      if (!w || !g) {
        this.toast('单词与释义都要填', true)
        return
      }
      const { entry } = this.deps.book.add({ word: w, lemma: w.toLowerCase(), gloss: g, source: 'local' })
      this.notifyEntry('add', entry)
      this.refreshPanel()
    })
    const cancel = button('取消', () => editor.remove())
    editor.append(word, gloss, save, cancel)
    host.after(editor)
    word.focus()
  }

  private pickImportFile(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.csv,application/json,text/csv'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return
      void file
        .text()
        .then((text) => this.importText(file.name, text))
        .catch(() => this.toast('读取文件失败', true))
    })
    input.click()
  }

  private importText(name: string, text: string): void {
    const items = parseVocabText(name, text)
    if (items.length === 0) {
      this.toast('没有识别到可导入的词（需要 word + gloss）', true)
      return
    }
    const result = importVocab(this.deps.book, items)
    for (const entry of result.entries) this.notifyEntry('add', entry)
    this.toast(`导入完成：新增 ${result.added}，更新 ${result.updated}，跳过 ${result.skipped}`, result.skipped > 0)
    this.refreshPanel()
  }

  private showEntryEditor(host: HTMLElement, entry: VocabEntry): void {
    host.replaceChildren()
    host.className = 'cb-item cb-editing'
    const input = document.createElement('input')
    input.className = 'cb-input'
    input.value = entry.gloss
    input.placeholder = '中文释义'
    const save = button('保存', () => {
      const gloss = input.value.trim()
      if (!gloss) {
        this.toast('释义不能为空', true)
        return
      }
      const updated = this.deps.book.update(entry.lemma, { gloss })
      if (updated) {
        this.notifyEntry('add', updated)
        this.refreshPanel()
      }
    })
    const cancel = button('取消', () => this.refreshPanel())
    host.append(input, save, cancel)
    input.focus()
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
    const root = resolvePassageRoot(document)
    return {
      modLoader: window.modUtils ? 'yes' : 'no',
      jquery: window.jQuery ? 'yes' : 'no',
      passage: String(window.State?.passage ?? '(none)'),
      passageRoot: describePassageRoot(document),
      textLength: String((root?.textContent ?? '').trim().length),
      choices: String(root?.querySelectorAll('a.link-internal, a[data-passage]').length ?? 0),
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

    const portLine = document.createElement('label')
    portLine.className = 'cb-setting cb-setting-port'
    const portLabel = document.createElement('span')
    portLabel.textContent = '端口'
    const portInput = document.createElement('input')
    portInput.type = 'number'
    portInput.min = '1024'
    portInput.max = '65535'
    portInput.step = '1'
    portInput.value = String(this.settings.port ?? 17321)
    const portSave = document.createElement('button')
    portSave.type = 'button'
    portSave.className = 'cb-btn'
    portSave.textContent = '保存'
    portSave.addEventListener('click', (ev) => {
      ev.preventDefault()
      const port = Number(portInput.value)
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        this.toast('端口要是 1024–65535 的整数', true)
        return
      }
      this.settings = { ...this.settings, port }
      this.deps.saveSettings?.(this.settings)
      this.toast('端口已保存，重新载入游戏后生效', false)
    })
    const portHint = document.createElement('span')
    portHint.className = 'cb-muted'
    portHint.textContent = '重新载入后生效'
    portLine.append(portLabel, portInput, portSave, portHint)
    wrap.append(portLine)
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
    const view: WordView = {
      word: entry.word,
      lemma: entry.lemma,
      gloss: entry.gloss,
      source: entry.source,
      sentence: entry.sentence ?? '',
      ...(entry.phonetic ? { phonetic: entry.phonetic } : {}),
      ...(entry.pos ? { pos: entry.pos } : {}),
      ...(entry.roots ? { roots: entry.roots } : {}),
      ...(entry.family ? { family: entry.family } : {}),
    }
    this.current = {
      kind: 'word',
      word: entry.word,
      sentence: entry.sentence ?? '',
      local: entry.source === 'local' ? view : null,
      coo: entry.source === 'local' ? null : view,
      pending: false,
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

const OWN_UI_SELECTOR = '#cb-panel, #cb-card, #cb-badge, #cb-fatal'
const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, label, summary, [contenteditable="true"], [role="button"], .link-internal'

function isOwnUi(el: Element | null | undefined): boolean {
  return !!el && !!el.closest(OWN_UI_SELECTOR)
}

function isInteractive(el: Element | null | undefined): boolean {
  return !!el && !!el.closest(INTERACTIVE_SELECTOR)
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
