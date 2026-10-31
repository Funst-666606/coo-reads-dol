/**
 * 入口级检查：模拟 Coopanion 的加载方式——只 import 包入口，不碰内部实现。
 * 目的：确保入口没有意外依赖 `cortico` 运行时（只允许 type import），
 * 且默认值覆盖了配置组里的每个键。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import definitionDefault, { DOL, DOL_DEFAULTS } from '../src/index.ts'

const DIR = join(process.cwd(), '.cache', 'entry-test')

function fakeContext(cfg: typeof DOL_DEFAULTS) {
  return {
    cfg,
    timezone: 'Asia/Taipei',
    botName: 'coo',
    botDir: DIR,
    packageDir: DIR,
    dataDir: DIR,
    repoRoot: DIR,
    secret: () => '',
    storeSecret: () => {},
    persist: () => {},
    restart: () => {},
  } as never
}

test('默认导出就是 WorldDefinition，且 id/label/defaults 正常', () => {
  assert.equal(definitionDefault, DOL)
  assert.equal(DOL.id, 'dol')
  assert.equal(typeof DOL.label, 'string')

  const cfg = DOL.defaults()
  assert.equal(cfg.enabled, false)
  assert.ok(cfg.port > 0)
  assert.ok(['proactive', 'trigger', 'passive'].includes(cfg.mode))
})

test('create() 能构造出 World，工具齐全', async () => {
  const cfg = DOL.defaults()
  const world = DOL.create(fakeContext(cfg))
  assert.equal(world.id, 'dol')
  assert.deepEqual(
    world.tools().map((t) => t.name).sort(),
    ['dol_define', 'dol_mode', 'dol_now', 'dol_setup', 'dol_teach', 'dol_vocab', 'dol_vocab_edit'],
  )
  const vars = await world.envPromptVars()
  assert.equal(vars?.['mode'], cfg.mode)
})

test('配置组里的每个键都在 defaults 里', () => {
  const world = DOL.create(fakeContext(DOL.defaults()))
  const decl = world.webUi?.('zh')
  const group = decl?.config?.find((g) => g.id === 'dol')
  assert.ok(group, '缺少 worlds.dol 配置组')

  for (const key of Object.keys(group.schema.properties)) {
    assert.ok(key.startsWith('worlds.dol.'), `配置路径 ${key} 不在 worlds.dol. 段内`)
    const local = key.slice('worlds.dol.'.length)
    assert.ok(local in DOL_DEFAULTS, `defaults 缺配置键 ${local}`)
  }
})

test('面板与提示词声明存在', () => {
  const world = DOL.create(fakeContext(DOL.defaults()))
  const decl = world.webUi?.('zh')
  assert.ok(decl?.panels?.some((p) => p.id === 'main'))
  assert.ok(decl?.promptDocs?.some((d) => d.role === 'envPrompt'))
})

// 清理：构造 World 不写盘，这里只防目录被别处创建
test.after(() => {
  mkdirSync(DIR, { recursive: true })
  rmSync(DIR, { recursive: true, force: true })
})
