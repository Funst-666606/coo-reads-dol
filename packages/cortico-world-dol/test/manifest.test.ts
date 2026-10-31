/** 扩展清单与面板产物的静态检查：保证装进 Coopanion 时不因缺文件失败。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkgPath = new URL('../package.json', import.meta.url)
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
  main: string
  cortico: { kind: string; api: number; webUiClient?: string }
}
const root = fileURLToPath(new URL('..', import.meta.url))

test('manifest：world / api 6 / 入口存在', () => {
  assert.equal(pkg.cortico.kind, 'world')
  assert.equal(pkg.cortico.api, 6)
  assert.ok(existsSync(`${root}src/index.ts`), 'src/index.ts 不存在')
  assert.equal(pkg.main, './src/index.ts')
})

test('面板产物存在且默认导出 panels.main.mount', async () => {
  const client = pkg.cortico.webUiClient
  assert.ok(client, '没有声明 webUiClient')
  assert.ok(existsSync(`${root}${client}`), `${client} 不存在，先跑构建`)

  const mod = (await import(new URL(`../${client}`, import.meta.url).href)) as {
    default: { panels: Record<string, { mount: unknown }> }
  }
  assert.equal(typeof mod.default.panels['main']?.mount, 'function')
})
