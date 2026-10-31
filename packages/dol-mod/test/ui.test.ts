/**
 * 游戏内 UI 的 DOM 测试（jsdom）：点词卡片、加入生词本、面板、问句往返。
 * 真实游戏里没验证到的交互，先在这里把逻辑跑通。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { requestId } from '../src/protocol.ts'
import { JsonCache } from '../src/cache.ts'
import { memoryKV } from '../src/store.ts'
import { VocabBook } from '../src/vocab.ts'

const TEXT = 'It was an incredible zzzz night.'

function setupDom(): { dom: JSDOM; textNode: Text; setCaret: (offset: number) => void } {
  const dom = new JSDOM(
    `<!doctype html><html><body><div id="passages"><p id="p">${TEXT}</p></div><div id="sidebar"><p id="side">A strange whisper in the dark.</p><button id="menu">Menu</button></div></body></html>`,
    { url: 'http://localhost/' },
  )
  const { window } = dom
  Object.assign(globalThis, {
    window,
    document: window.document,
    Node: window.Node,
    MouseEvent: window.MouseEvent,
    Event: window.Event,
  })

  const p = window.document.getElementById('p')
  const textNode = p?.firstChild
  assert.ok(textNode && textNode.nodeType === 3)
  let range = window.document.createRange()
  range.setStart(textNode, 0)
  range.setEnd(textNode, 0)
  Object.assign(window.document, {
    caretRangeFromPoint: () => range,
    caretPositionFromPoint: () => ({ offsetNode: textNode, offset: range.startOffset }),
  })
  return {
    dom,
    textNode: textNode as Text,
    setCaret: (offset: number) => {
      range = window.document.createRange()
      range.setStart(textNode, offset)
      range.setEnd(textNode, offset)
      Object.assign(window.document, { caretRangeFromPoint: () => range })
    },
  }
}

test('点词 → 单词卡 → 加入生词本', async () => {
  const { dom, setCaret } = setupDom()
  const { Ui } = await import('../src/ui.ts')
  const kv = memoryKV()
  const book = new VocabBook(kv)
  const notified: Array<{ op: string; entry: Record<string, unknown> }> = []
  const spoken: string[] = []
  const ui = new Ui({
    book,
    sentenceCache: new JsonCache(kv, 'trans.v1'),
    wordCache: new JsonCache(kv, 'word.v1'),
    askSentence: (text) => requestId('s', text),
    askWord: (word, sentence) => requestId('w', `${word}|${sentence}`),
    notifyVocab: (op, entry) => notified.push({ op, entry }),
    speak: (text) => spoken.push(text),
    connected: () => true,
    reconnect: () => {},
  })
  ui.mount()

  const idx = TEXT.indexOf('incredible') + 3
  setCaret(idx)
  dom.window.document.getElementById('p')?.dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true, clientX: 40, clientY: 40 }),
  )

  const card = dom.window.document.getElementById('cb-card')
  assert.ok(card)
  assert.equal(card.hidden, false)
  assert.match(card.textContent ?? '', /incredible/)
  assert.match(card.textContent ?? '', /难以置信/)
  assert.match(card.textContent ?? '', /cred/)
  assert.match(card.textContent ?? '', /加入生词本/)

  const add = [...card.querySelectorAll('button')].find((b) => b.textContent === '加入生词本')
  assert.ok(add)
  add.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))

  assert.equal(book.list().length, 1)
  assert.equal(notified[0]?.op, 'add')
  assert.equal(notified[0]?.entry['lemma'], 'incredible')

  // 朗读按钮：读原形
  const speakBtn = card.querySelector('.cb-speak')
  assert.ok(speakBtn, '单词卡缺少朗读按钮')
  speakBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  assert.deepEqual(spoken, ['incredible'])
})

test('点句（Alt+点击）→ Coo 往返 → 译文上卡 → 再点命中缓存', async () => {
  const { dom, setCaret } = setupDom()
  const { Ui } = await import('../src/ui.ts')
  const kv = memoryKV()
  const asked: string[] = []
  const ui = new Ui({
    book: new VocabBook(kv),
    sentenceCache: new JsonCache(kv, 'trans.v1'),
    wordCache: new JsonCache(kv, 'word.v1'),
    askSentence: (text) => {
      asked.push(text)
      return requestId('s', text)
    },
    askWord: () => null,
    notifyVocab: () => {},
    connected: () => true,
    reconnect: () => {},
  })
  ui.mount()

  setCaret(TEXT.indexOf('incredible'))
  dom.window.document.getElementById('p')?.dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true, altKey: true, clientX: 40, clientY: 40 }),
  )

  assert.equal(asked.length, 1)
  assert.equal(asked[0], TEXT)

  const card = dom.window.document.getElementById('cb-card')
  assert.ok(card)
  assert.match(card.textContent ?? '', /Coo 正在想/)

  ui.onReply(requestId('s', TEXT), 'sentence', {
    translation: '那是一个难以置信的夜晚。',
    notes: ['过去时叙述'],
  })
  assert.match(card.textContent ?? '', /难以置信的夜晚/)
  assert.match(card.textContent ?? '', /过去时叙述/)

  // 同一句再点：命中缓存，不再请求
  dom.window.document.getElementById('p')?.dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true, altKey: true, clientX: 40, clientY: 40 }),
  )
  assert.equal(asked.length, 1)
  assert.match(card.textContent ?? '', /难以置信的夜晚/)
})

test('本地未收录 → 问 Coo → 回传后显示 AI 推测', async () => {
  const { dom, setCaret } = setupDom()
  const { Ui } = await import('../src/ui.ts')
  const kv = memoryKV()
  let askedWord = ''
  let askedId = ''
  const ui = new Ui({
    book: new VocabBook(kv),
    sentenceCache: new JsonCache(kv, 'trans.v1'),
    wordCache: new JsonCache(kv, 'word.v1'),
    askSentence: () => null,
    askWord: (word, sentence) => {
      askedWord = word
      askedId = requestId('w', `${word}|${sentence}`)
      return askedId
    },
    notifyVocab: () => {},
    connected: () => true,
    reconnect: () => {},
  })
  ui.mount()

  setCaret(TEXT.indexOf('zzzz') + 1)
  dom.window.document.getElementById('p')?.dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true, clientX: 40, clientY: 40 }),
  )

  assert.ok(askedWord === '' || askedWord === 'zzzz')
  const card = dom.window.document.getElementById('cb-card')
  assert.ok(card)
  assert.equal(card.hidden, false)
  assert.match(card.textContent ?? '', /问 Coo 这个词/)

  const btn = [...card.querySelectorAll('button')].find((b) => b.textContent === '问 Coo 这个词')
  assert.ok(btn)
  btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  assert.equal(askedWord, 'zzzz')
  assert.match(card.textContent ?? '', /Coo 正在想/)

  ui.onReply(askedId, 'word', {
    lemma: 'zzzz',
    gloss: '（测试）拟声词',
    source: 'coo',
    roots: [{ part: 'zz', type: 'root', meaning: '测试' }],
  })
  assert.match(card.textContent ?? '', /拟声词/)
  assert.match(card.textContent ?? '', /AI 推测/)
})

test('问句超时：卡片从「正在想」切到失败 + 重试', async () => {
  const { dom, setCaret } = setupDom()
  const { Ui } = await import('../src/ui.ts')
  const kv = memoryKV()
  const ui = new Ui({
    book: new VocabBook(kv),
    sentenceCache: new JsonCache(kv, 'trans.v1'),
    wordCache: new JsonCache(kv, 'word.v1'),
    askSentence: (text) => requestId('s', text),
    askWord: () => null,
    notifyVocab: () => {},
    connected: () => true,
    reconnect: () => {},
  })
  ui.mount()

  setCaret(TEXT.indexOf('incredible'))
  dom.window.document.getElementById('p')?.dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true, altKey: true, clientX: 40, clientY: 40 }),
  )

  ui.onReplyFailed(requestId('s', TEXT), 'timeout')
  const card = dom.window.document.getElementById('cb-card')
  assert.ok(card)
  assert.match(card.textContent ?? '', /没等到 Coo/)
  assert.ok([...card.querySelectorAll('button')].some((b) => b.textContent === '重试'))
})

test('查词失败：回到「问 Coo 这个词」并保留原句', async () => {
  const { dom, setCaret } = setupDom()
  const { Ui } = await import('../src/ui.ts')
  const kv = memoryKV()
  const ui = new Ui({
    book: new VocabBook(kv),
    sentenceCache: new JsonCache(kv, 'trans.v1'),
    wordCache: new JsonCache(kv, 'word.v1'),
    askSentence: () => null,
    askWord: (word, sentence) => requestId('w', `${word}|${sentence}`),
    notifyVocab: () => {},
    connected: () => true,
    reconnect: () => {},
  })
  ui.mount()

  setCaret(TEXT.indexOf('zzzz') + 1)
  dom.window.document.getElementById('p')?.dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true, clientX: 40, clientY: 40 }),
  )
  const card = dom.window.document.getElementById('cb-card')
  assert.ok(card)
  const ask = [...card.querySelectorAll('button')].find((b) => b.textContent === '问 Coo 这个词')
  assert.ok(ask)
  ask.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))

  ui.onReplyFailed(requestId('w', `zzzz|${TEXT}`), 'coo_unavailable')
  assert.match(card.textContent ?? '', /本地词典未收录/)
  assert.ok([...card.querySelectorAll('button')].some((b) => b.textContent === '问 Coo 这个词'))
})

test('本地词也能问 Coo，本地与 Coo 内容并存', async () => {
  const { dom, setCaret } = setupDom()
  const { Ui } = await import('../src/ui.ts')
  const kv = memoryKV()
  const ui = new Ui({
    book: new VocabBook(kv),
    sentenceCache: new JsonCache(kv, 'trans.v1'),
    wordCache: new JsonCache(kv, 'word.v1'),
    askSentence: () => null,
    askWord: (word, sentence) => requestId('w', `${word}|${sentence}`),
    notifyVocab: () => {},
    connected: () => true,
    reconnect: () => {},
  })
  ui.mount()

  setCaret(TEXT.indexOf('incredible') + 2)
  dom.window.document.getElementById('p')?.dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true, clientX: 40, clientY: 40 }),
  )
  const card = dom.window.document.getElementById('cb-card')
  assert.ok(card)
  assert.match(card.textContent ?? '', /难以置信/)
  assert.match(card.textContent ?? '', /本地词典/)

  const ask = [...card.querySelectorAll('button')].find((b) => b.textContent === '问 Coo 这个词')
  assert.ok(ask, '本地词也应永远有「问 Coo 这个词」')
  ask.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))

  ui.onReply(requestId('w', `incredible|${TEXT}`), 'word', {
    lemma: 'incredible',
    gloss: '（Coo）不可思议的',
    source: 'coo',
  })
  assert.match(card.textContent ?? '', /难以置信/, '本地释义应保留')
  assert.match(card.textContent ?? '', /不可思议的/, 'Coo 的释义应同时显示')
  assert.match(card.textContent ?? '', /Coo 补充/)
})

test('设置：关掉点词查义后点词不弹卡，勾回来会保存', async () => {
  const { dom, setCaret } = setupDom()
  const { Ui } = await import('../src/ui.ts')
  const { DEFAULT_SETTINGS } = await import('../src/settings.ts')
  const kv = memoryKV()
  const saved: unknown[] = []
  const ui = new Ui({
    book: new VocabBook(kv),
    sentenceCache: new JsonCache(kv, 'trans.v1'),
    wordCache: new JsonCache(kv, 'word.v1'),
    askSentence: () => null,
    askWord: () => null,
    notifyVocab: () => {},
    settings: { ...DEFAULT_SETTINGS, wordCard: false },
    saveSettings: (next) => saved.push(next),
    connected: () => true,
    reconnect: () => {},
  })
  ui.mount()

  setCaret(TEXT.indexOf('incredible'))
  dom.window.document.getElementById('p')?.dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true, clientX: 40, clientY: 40 }),
  )
  const card = dom.window.document.getElementById('cb-card')
  assert.ok(card)
  assert.equal(card.hidden, true, '关掉点词查义后不应弹卡')

  const badge = dom.window.document.getElementById('cb-badge')
  badge?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  const panel = dom.window.document.getElementById('cb-panel')
  assert.ok(panel)
  const settingsTab = [...panel.querySelectorAll('[data-tab]')].find((t) => (t as HTMLElement).dataset['tab'] === 'settings')
  settingsTab?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))

  const row = [...panel.querySelectorAll('.cb-setting')].find((el) => el.textContent?.includes('点词查义'))
  assert.ok(row, '设置页缺少点词查义开关')
  const input = row.querySelector('input')
  assert.ok(input)
  assert.equal(input.checked, false)
  input.checked = true
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  assert.equal((saved.at(-1) as { wordCard: boolean }).wordCard, true)
})

test('正文之外（侧栏/二级面板）也能点词，按钮不触发', async () => {
  const { dom } = setupDom()
  const { Ui } = await import('../src/ui.ts')
  const kv = memoryKV()
  const ui = new Ui({
    book: new VocabBook(kv),
    sentenceCache: new JsonCache(kv, 'trans.v1'),
    wordCache: new JsonCache(kv, 'word.v1'),
    askSentence: () => null,
    askWord: () => null,
    notifyVocab: () => {},
    connected: () => true,
    reconnect: () => {},
  })
  ui.mount()

  const side = dom.window.document.getElementById('side')
  assert.ok(side)
  const node = side.firstChild
  assert.ok(node)
  const range = dom.window.document.createRange()
  range.setStart(node, 2)
  range.setEnd(node, 2)
  Object.assign(dom.window.document, { caretRangeFromPoint: () => range })

  side.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 12, clientY: 12 }))
  const card = dom.window.document.getElementById('cb-card')
  assert.ok(card)
  assert.equal(card.hidden, false, '侧栏文字应能点出单词卡')
  assert.match(card.textContent ?? '', /strange/)

  // 按钮属于交互元素，不应弹卡
  card.hidden = true
  const menu = dom.window.document.getElementById('menu')
  assert.ok(menu)
  menu.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 12, clientY: 12 }))
  assert.equal(card.hidden, true)
})

test('词库菜单：手动添加与编辑释义', async () => {
  const { dom } = setupDom()
  const { Ui } = await import('../src/ui.ts')
  const kv = memoryKV()
  const book = new VocabBook(kv)
  const ui = new Ui({
    book,
    sentenceCache: new JsonCache(kv, 'trans.v1'),
    wordCache: new JsonCache(kv, 'word.v1'),
    askSentence: () => null,
    askWord: () => null,
    notifyVocab: () => {},
    connected: () => true,
    reconnect: () => {},
  })
  ui.mount()

  dom.window.document.getElementById('cb-badge')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  const panel = dom.window.document.getElementById('cb-panel')
  assert.ok(panel)

  const addBtn = [...panel.querySelectorAll('button')].find((b) => b.textContent === '手动添加')
  assert.ok(addBtn, '缺少手动添加按钮')
  addBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))

  const inputs = panel.querySelectorAll('.cb-editor .cb-input')
  assert.equal(inputs.length, 2)
  ;(inputs[0] as HTMLInputElement).value = 'whisper'
  ;(inputs[1] as HTMLInputElement).value = '低语'
  const save = [...panel.querySelectorAll('.cb-editor button')].find((b) => b.textContent === '保存')
  assert.ok(save)
  save.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))

  assert.match(panel.textContent ?? '', /whisper/)
  assert.equal(book.find('whisper')?.gloss, '低语')

  const edit = [...panel.querySelectorAll('.cb-item button')].find((b) => b.textContent === '改')
  assert.ok(edit, '缺少编辑按钮')
  edit.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  const glossInput = panel.querySelector('.cb-editing .cb-input') as HTMLInputElement | null
  assert.ok(glossInput)
  glossInput.value = '低声说'
  const saveEdit = [...panel.querySelectorAll('.cb-editing button')].find((b) => b.textContent === '保存')
  assert.ok(saveEdit)
  saveEdit.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))

  assert.equal(book.find('whisper')?.gloss, '低声说')
})

test('面板：生词列表、复习、自检', async () => {
  const { dom } = setupDom()
  const { Ui } = await import('../src/ui.ts')
  const kv = memoryKV()
  const book = new VocabBook(kv)
  book.add({ word: 'dark', lemma: 'dark', gloss: '黑暗的', source: 'local' }, Date.now() - 10 * 86_400_000)
  const ui = new Ui({
    book,
    sentenceCache: new JsonCache(kv, 'trans.v1'),
    wordCache: new JsonCache(kv, 'word.v1'),
    askSentence: () => null,
    askWord: () => null,
    notifyVocab: () => {},
    connected: () => false,
    reconnect: () => {},
  })
  ui.mount()

  const badge = dom.window.document.getElementById('cb-badge')
  assert.ok(badge)
  badge.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))

  const panel = dom.window.document.getElementById('cb-panel')
  assert.ok(panel)
  assert.equal(panel.hidden, false)
  assert.match(panel.textContent ?? '', /dark/)

  const tabs = [...panel.querySelectorAll('[data-tab]')]
  const reviewTab = tabs.find((t) => (t as HTMLElement).dataset['tab'] === 'review')
  assert.ok(reviewTab)
  reviewTab.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  assert.match(panel.textContent ?? '', /今天到期/)

  const settings = tabs.find((t) => (t as HTMLElement).dataset['tab'] === 'settings')
  assert.ok(settings)
  settings.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  assert.match(panel.textContent ?? '', /自检/)
  assert.match(panel.textContent ?? '', /passage:/)
})
