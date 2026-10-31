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


        const playBox = document.createElement('div')
        const playSection = ui.section(t('玩法与态度', 'Play & attitude'))
        sheet.body.append(playSection, playBox)

        const mkBtn = (label, onClick, active) => {
          const b = document.createElement('button')
          b.type = 'button'
          b.className = 'cb-btn'
          b.textContent = label
          if (active) {
            b.style.borderColor = '#9fc7d8'
            b.style.color = '#9fc7d8'
          }
          b.addEventListener('click', (ev) => {
            ev.preventDefault()
            onClick()
          })
          return b
        }

        function renderPlay(status) {
          playBox.replaceChildren()
          const line1 = ui.rowbar()
          line1.append(
            mkBtn(status.enabled ? t('总开关：开', 'Enabled') : t('总开关：关', 'Disabled'), async () => {
              await ctx.invoke('setEnabled', [!status.enabled])
              await refresh()
            }, status.enabled),
            mkBtn(status.learning ? t('学习英语', 'Learning') : t('只陪玩', 'Companion'), async () => {
              await ctx.invoke('setLearning', [!status.learning])
              await refresh()
            }, status.learning),
          )
          playBox.append(line1)

          const att = ui.rowbar()
          const items = [
            ['strict', t('严谨', 'Strict')],
            ['normal', t('正常', 'Normal')],
            ['subtle', t('含蓄', 'Subtle')],
            ['erotic', t('色情', 'Erotic')],
            ['lewd', t('淫乱', 'Lewd')],
          ]
          for (const [value, label] of items) {
            const locked = (value === 'erotic' || value === 'lewd') && !status.adult
            const b = mkBtn(label, async () => {
              if (locked) return
              await ctx.invoke('setAttitude', [value])
              await refresh()
            }, status.effectiveAttitude === value)
            b.disabled = locked
            b.title = locked ? t('先打开成人内容', 'Enable adult content first') : ''
            att.append(b)
          }
          playBox.append(att)

          playBox.append(
            mkBtn(status.adult ? t('成人内容：开', 'Adult: on') : t('成人内容：关', 'Adult: off'), async () => {
              await ctx.invoke('setAdult', [!status.adult])
              await refresh()
            }, status.adult),
          )
        }

        let onboarded = false
        function showOnboard() {
          if (onboarded) return
          onboarded = true
          const ov = document.createElement('div')
          ov.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)'
          const card = document.createElement('div')
          card.style.cssText = 'max-width:360px;padding:20px;border-radius:14px;background:#1d1d22;color:#eee;border:1px solid #3a3a44;text-align:center'
          card.innerHTML = '<h3 style="margin:0 0 8px">欲都孤鱼与多邻鱼</h3><p style="margin:0 0 14px;color:#bbb">要陪你学英语，还是只想一起玩？</p>'
          const row = document.createElement('div')
          row.style.cssText = 'display:flex;gap:8px;justify-content:center'
          const learn = mkBtn(t('学英语', 'Learn English'), async () => {
            await ctx.invoke('completeOnboarding', [true])
            ov.remove()
            await refresh()
          })
          const play = mkBtn(t('只想玩', 'Just play'), async () => {
            await ctx.invoke('completeOnboarding', [false])
            ov.remove()
            await refresh()
          })
          row.append(learn, play)
          card.append(row)
          ov.append(card)
          document.body.append(ov)
        }

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
            renderPlay(status)
            if (!status.onboarded) showOnboard()
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
