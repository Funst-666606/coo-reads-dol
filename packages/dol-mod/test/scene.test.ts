/** 场景读取：正文、选项（含序号剥离）、状态。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { cleanLabel, readScene } from '../src/scene.ts'

function domFor(html: string): { root: Element | null } {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`)
  return { root: dom.window.document.querySelector('#passages') }
}

test('cleanLabel 去掉 SugarCube 的编号与项目符号', () => {
  assert.equal(cleanLabel('1. Go outside'), 'Go outside')
  assert.equal(cleanLabel('2) Sleep'), 'Sleep')
  assert.equal(cleanLabel('3、 发呆'), '发呆')
  assert.equal(cleanLabel('— Look around'), 'Look around')
  assert.equal(cleanLabel('  Take   the   bait '), 'Take the bait')
})

test('cleanLabel 去掉 DoL 的 (1) 编号', () => {
  assert.equal(cleanLabel('(1) Go outside'), 'Go outside')
  assert.equal(cleanLabel('(12) Sleep'), 'Sleep')
  assert.equal(cleanLabel('(3)   Pull the lever'), 'Pull the lever')
  assert.equal(cleanLabel('There (1) is not a number'), 'There (1) is not a number')
})

test('readScene 读出正文、选项与状态', () => {
  const { root } = domFor(`
    <div id="passages">
      <h1>Bedroom</h1>
      <p>It was dark.</p>
      <a class="link-internal" data-passage="Outside">(1) Go outside</a>
      <a class="link-internal">(2) Sleep</a>
    </div>`)

  const scene = readScene({
    passage: 'Bedroom',
    root,
    variables: { location: 'Orphanage', days: 3, time: 'night', money: 20 },
  })

  assert.ok(scene)
  assert.equal(scene.passage, 'Bedroom')
  assert.match(scene.text, /It was dark\./)
  assert.deepEqual(
    scene.choices.map((c) => `${c.index}:${c.label}`),
    ['1:Go outside', '2:Sleep'],
  )
  assert.deepEqual(scene.state, { location: 'Orphanage', day: 3, time: 'night', money: 20 })
  assert.equal(scene.title, 'Bedroom')
})

test('readState：$time 是分钟数时格式化成 HH:MM，天数是 $days', () => {
  const { root } = domFor('<div id="passages">x</div>')
  const scene = readScene({
    passage: 'X',
    root,
    variables: { days: 12, time: 90, location: 'School' },
  })
  assert.deepEqual(scene?.state, { location: 'School', day: 12, time: '01:30' })

  const late = readScene({ passage: 'X', root, variables: { time: 1500 } })
  assert.equal(late?.state.time, '01:00')
})

test('readScene：没有根节点或正文为空时返回 null', () => {
  assert.equal(readScene({ passage: 'X', root: null }), null)
  const { root } = domFor('<div id="passages">   </div>')
  assert.equal(readScene({ passage: 'X', root }), null)
  assert.equal(readScene({ passage: '', root }), null)
})

test('readScene 截断正文到上限', () => {
  const { root } = domFor(`<div id="passages">${'a'.repeat(200)}</div>`)
  const scene = readScene({ passage: 'X', root, limit: 50 })
  assert.equal(scene?.text.length, 50)
})
