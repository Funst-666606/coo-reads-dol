/** describe.json 与代码同源：改了工具/事件/环境提示就重跑 node scripts/gen-describe.mjs。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DOL } from '../src/index.ts'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  cortico: { describe?: string }
}
const generated = JSON.parse(readFileSync(new URL('../describe.json', import.meta.url), 'utf8')) as {
  tools: unknown[]
  events: unknown[]
  prompts?: Array<{ key: string; title: string; role?: string; content: string }>
}

test('manifest 指向 describe.json', () => {
  assert.equal(pkg.cortico.describe, 'describe.json')
})

test('describe.json 的 tools / events 与代码一致', () => {
  assert.ok(DOL.describe, 'DOL 没有 describe')
  assert.deepEqual(generated.tools, JSON.parse(JSON.stringify(DOL.describe.tools)))
  assert.deepEqual(generated.events, JSON.parse(JSON.stringify(DOL.describe.events)))
})

test('describe.json 内嵌环境提示词正文', () => {
  const prompts = generated.prompts ?? []
  assert.equal(prompts.length, 1)
  const doc = prompts[0]
  assert.ok(doc)
  assert.equal(doc.role, 'envPrompt')
  assert.equal(doc.key, 'worlds.dol.env')

  const source = readFileSync(new URL('../src/ENV_PROMPT.md', import.meta.url), 'utf8')
  assert.equal(doc.content, source)
})

test('describe 里的工具与 tools() 名字一致，事件都有说明', () => {
  const world = DOL.create({
    cfg: DOL.defaults(),
    dataDir: '.cache/describe-test',
    timezone: 'Asia/Taipei',
    persist: () => {},
  } as never)

  const declared = (DOL.describe?.tools ?? []).map((t) => t.name).sort()
  const actual = world.tools().map((t) => t.name).sort()
  assert.deepEqual(declared, actual)

  const events = DOL.describe?.events ?? []
  assert.equal(events.length, 9)
  for (const event of events) {
    assert.ok(event.type.startsWith('dol.'))
    const text = typeof event.description === 'string' ? event.description : (event.description.zh ?? event.description.en)
    assert.ok(text.length > 0)
  }
})
