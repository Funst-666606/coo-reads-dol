/** 发布产物检查：.mod.zip 的结构必须是 ModLoader 能直接吃的（boot.json 在根、路径大小写一致）。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'

const ZIP_PATH = new URL('../CooBridge.mod.zip', import.meta.url)
const hasZip = existsSync(ZIP_PATH)

function entries(): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(readFileSync(ZIP_PATH)))
}

test('zip 里有 boot.json / 脚本 / 样式，且都在根目录', { skip: !hasZip && '先跑 node scripts/build-all.mjs' }, () => {
  const files = entries()
  const names = Object.keys(files).sort()
  assert.deepEqual(names, ['CooBridge.css', 'CooBridge.js', 'boot.json'])
  for (const name of names) assert.ok(!name.includes('/'), `${name} 不应带目录前缀`)
})

test('boot.json 必填字段齐全，且列表里的文件真的在 zip 里', { skip: !hasZip && '先跑构建' }, () => {
  const files = entries()
  const boot = JSON.parse(strFromU8(files['boot.json'] ?? new Uint8Array())) as Record<string, unknown>

  assert.equal(boot['name'], 'CooBridge')
  assert.match(String(boot['version']), /^\d+\.\d+\.\d+$/)
  for (const key of ['styleFileList', 'scriptFileList', 'tweeFileList', 'imgFileList']) {
    assert.ok(Array.isArray(boot[key]), `${key} 必须是数组`)
  }
  for (const list of ['styleFileList', 'scriptFileList'] as const) {
    for (const file of boot[list] as string[]) {
      assert.ok(files[file], `${list} 里的 ${file} 不在 zip 里`)
    }
  }
})

test('脚本不是空文件，且以 IIFE 包裹', { skip: !hasZip && '先跑构建' }, () => {
  const files = entries()
  const js = strFromU8(files['CooBridge.js'] ?? new Uint8Array())
  assert.ok(js.length > 10_000, `脚本太小：${js.length}`)
  assert.match(js.slice(0, 80), /^\(function/)
})
