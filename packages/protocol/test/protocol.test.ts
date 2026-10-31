/**
 * 协议单元测试：用 Node 内置 test runner + 类型擦除直接跑 TS，不依赖 vitest
 * （受限环境里 vitest 的 worker/子进程不可用）。
 *
 * 跑法：node --test packages/protocol/test/protocol.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { PROTOCOL_VERSION, decodeModMessage, decodeWorldMessage, requestId } from '../src/index.ts'

test('接受合法 hello', () => {
  const msg = decodeModMessage({
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    client: { name: 'CooBridge', version: '0.1.0' },
    game: { version: '0.5.12.13', passage: 'Start', lang: 'en' },
  })
  assert.equal(msg?.type, 'hello')
})

test('拒绝缺字段的 hello', () => {
  assert.equal(decodeModMessage({ type: 'hello', protocol: 1 }), null)
})

test('scene 会丢掉形状不对的选项', () => {
  const msg = decodeModMessage({
    type: 'scene',
    seq: 1,
    passage: 'Start',
    text: 'hello',
    choices: [{ index: 1, label: 'go' }, { index: 'x' }, null],
    state: { day: 2 },
  })
  assert.equal(msg?.type, 'scene')
  if (msg?.type !== 'scene') return
  assert.deepEqual(msg.choices, [{ index: 1, label: 'go' }])
  assert.deepEqual(msg.state, { day: 2 })
})

test('sentence 必须有 id 与 text', () => {
  assert.equal(decodeModMessage({ type: 'sentence', text: 'x' }), null)
  assert.equal(decodeModMessage({ type: 'sentence', id: 's1', text: 'x' })?.type, 'sentence')
})

test('未知类型返回 null', () => {
  assert.equal(decodeModMessage({ type: 'nope' }), null)
  assert.equal(decodeModMessage('hello'), null)
})

test('接受 hello_ok', () => {
  const msg = decodeWorldMessage({
    type: 'hello_ok',
    protocol: 1,
    world: { version: '0.1.0' },
    features: ['scene'],
  })
  assert.equal(msg?.type, 'hello_ok')
})

test('reply 的 kind 只认 sentence / word', () => {
  assert.equal(decodeWorldMessage({ type: 'reply', id: 'a', kind: 'x', ok: true }), null)
  const ok = decodeWorldMessage({
    type: 'reply',
    id: 'a',
    kind: 'sentence',
    ok: true,
    payload: { translation: '你好', notes: [] },
  })
  assert.equal(ok?.type, 'reply')
})

test('error 需要 code 与 message', () => {
  assert.equal(decodeWorldMessage({ type: 'error', code: 'timeout' }), null)
  assert.equal(decodeWorldMessage({ type: 'error', code: 'timeout', message: '超时' })?.type, 'error')
})

test('requestId 同一段文本稳定，不同文本不同', () => {
  assert.equal(requestId('s', 'hello'), requestId('s', 'hello'))
  assert.notEqual(requestId('s', 'hello'), requestId('s', 'hellp'))
  assert.notEqual(requestId('w', 'hello'), requestId('s', 'hello'))
})
