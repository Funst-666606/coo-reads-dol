/**
 * DoL 陪读 · WebUI 面板（浏览器模块，无构建依赖）。
 *
 * 只做四件事：显示连接与统计、切换三档模式、看生词镜像、导出。
 * 游戏内的查词/问句卡片不在这里，那是模组自己的 UI。
 */

const MODES = [
  { value: 'proactive', label: '主动' },
  { value: 'trigger', label: '触发' },
  { value: 'passive', label: '被动' },
]

export default {
  panels: {
    main: {
      async mount(ctx) {
        const ui = ctx.ui
        const zh = ctx.language !== 'en'
        const t = (cn, en) => (zh ? cn : en)

        const sheet = ui.sheet({
          title: t('DoL 陪读', 'DoL tutor'),
          desc: t(
            '游戏里装 CooBridge.mod.zip；右下角圆点变绿即连上。模式切换会写回 worlds.dol.mode。',
            'Install CooBridge.mod.zip in the game; a green dot means connected. Mode changes are saved to worlds.dol.mode.',
          ),
        })
        ctx.root.append(sheet.el)

        const statusPill = ui.pill(t('未连接', 'offline'), 'off')
        const portText = document.createTextNode('—')
        const passageText = document.createTextNode('—')
        const commentsText = document.createTextNode('—')
        const vocabText = document.createTextNode('—')
        const modeNote = ui.msgline('')

        sheet.body.append(
          ui.kv([
            { k: t('连接', 'Link'), v: statusPill },
            { k: t('端口', 'Port'), v: portText },
            { k: t('当前场景', 'Passage'), v: passageText },
            { k: t('今日评论', 'Comments today'), v: commentsText },
            { k: t('生词镜像', 'Vocab mirror'), v: vocabText },
          ]),
        )

        const seg = ui.segmented(MODES, {
          value: 'trigger',
          onSelect: async (value) => {
            try {
              await ctx.invoke('setMode', [value])
              ui.toast(t('模式已切换', 'Mode changed'), 'ok')
              await refresh()
            } catch (err) {
              ui.toast(String(err && err.message ? err.message : err), 'bad')
            }
          },
        })
        const segRow = ui.rowbar()
        segRow.append(seg.el, modeNote)
        sheet.body.append(
          ui.section(t('陪读模式', 'Mode')),
          segRow,
          ui.kv([
            { k: t('主动', 'Proactive'), v: t('会主动评论、提醒复习', 'comments and review reminders') },
            { k: t('触发', 'Trigger'), v: t('只在换场景 / 做选择时说一句', 'one line per scene or choice') },
            { k: t('被动', 'Passive'), v: t('只有你点词 / 点句时才说话', 'only when you click a word or sentence') },
          ]),
        )

        const table = ui.table({
          head: [t('词', 'Word'), t('释义', 'Gloss'), t('到期', 'Due'), 'box', t('掌握', 'Mastered')],
          maxHeight: '260px',
        })
        const vocabSection = ui.section(t('生词镜像', 'Vocab mirror'), t('只读：来自游戏里的生词本', 'Read-only mirror of the in-game vocab book'))
        sheet.body.append(vocabSection, table.el)

        const actions = ui.actions()
        actions.append(
          ui.button(t('导出 CSV', 'Export CSV'), {
            size: 'sm',
            onClick: async () => {
              const csv = await ctx.invoke('exportCsv')
              download('dol-vocab-mirror.csv', `\ufeff${csv}`, 'text/csv')
            },
          }),
          ui.button(t('导出 JSON', 'Export JSON'), {
            size: 'sm',
            onClick: async () => {
              const json = await ctx.invoke('exportJson')
              download('dol-vocab-mirror.json', json, 'application/json')
            },
          }),
          ui.button(t('刷新', 'Refresh'), { size: 'sm', onClick: () => refresh() }),
        )
        sheet.body.append(actions)

        let disposed = false
        async function refresh() {
          if (disposed) return
          try {
            const status = await ctx.invoke('status')
            statusPill.textContent = status.connected ? t('已连接', 'connected') : t('未连接', 'offline')
            statusPill.className = `pill ${status.connected ? 'on' : 'off'}`
            portText.textContent = String(status.port)
            passageText.textContent = status.passage
              ? `${status.passage}${status.day ? ` · 第 ${status.day} 天` : ''}${status.location ? ` · ${status.location}` : ''}`
              : t('还没收到场景', 'no scene yet')
            commentsText.textContent = `${status.todayComments}${status.commentCap > 0 ? ` / ${status.commentCap}` : ''}`
            vocabText.textContent = `${status.vocab.total}${t(' 词', '')} · ${status.vocab.due}${t(' 到期', ' due')}`
            seg.setValue(status.mode)
            const current = MODES.find((m) => m.value === status.mode)
            modeNote.textContent = t(`当前：${current?.label ?? status.mode}`, `current: ${status.mode}`)

            const list = await ctx.invoke('vocab')
            table.clear(list.length === 0 ? t('还没有生词', 'no words yet') : '')
            for (const entry of list) {
              table.addRow([
                entry.word,
                entry.gloss,
                entry.dueAt ? new Date(entry.dueAt).toLocaleDateString() : '—',
                entry.box !== undefined ? String(entry.box) : '—',
                entry.mastered ? '✓' : '',
              ])
            }
          } catch (err) {
            modeNote.textContent = String(err && err.message ? err.message : err)
          }
        }

        await refresh()
        ctx.interval(() => {
          void refresh()
        }, 5000)
        ctx.signal.addEventListener('abort', () => {
          disposed = true
        })
      },
    },
  },
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
