/** 版本探测：优先 StartConfig.version，其次 State.variables，最后 Story。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { pickGameVersion } from '../src/version.ts'

test('优先读 StartConfig.version', () => {
  assert.equal(pickGameVersion({ startConfig: { version: '0.5.12.13' } }), '0.5.12.13')
  assert.equal(
    pickGameVersion({ startConfig: { version: '0.5.12.13', versionName: '"Abyssal" edition' } }),
    '0.5.12.13',
  )
})

test('没有 StartConfig 时依次回退', () => {
  assert.equal(pickGameVersion({ variables: { version: '0.5.11.2' } }), '0.5.11.2')
  assert.equal(pickGameVersion({ storyText: 'Version 0.5.10.1 released' }), '0.5.10.1')
})

test('都读不到时返回 unknown', () => {
  assert.equal(pickGameVersion({}), 'unknown')
  assert.equal(pickGameVersion({ startConfig: { version: 42 } }), 'unknown')
  assert.equal(pickGameVersion({ startConfig: { version: 'dev' } }), 'unknown')
})
