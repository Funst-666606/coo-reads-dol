/**
 * 用 Coopanion 自带的框架代码校验扩展（等价于 check:extension 的核心三项）：
 * 1. manifest：kind / api / 字段形状
 * 2. dry-mount：构造 World、tools()、envPromptVars()、webUi()、配置路径
 * 3. describe：describe.json 与代码一致、工具名/参数一致
 *
 * 用法：
 *   node scripts/fw-check.mjs
 *   $env:COOPANION_HOME='D:\Coopanion'; node scripts/fw-check.mjs
 */
import { register } from 'node:module'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const home = process.env.COOPANION_HOME
const framework = home ? join(home, 'resources/app/build/cortico/src/extensions') : ''

if (!home) {
  console.error("请设置 COOPANION_HOME 指向 Coopanion 安装目录，例如：")
  console.error("  PowerShell: $env:COOPANION_HOME='C:\\path\\to\\Coopanion'")
  process.exit(2)
}

if (!existsSync(framework)) {
  console.error(`找不到 Coopanion 框架：${framework}\n检查 COOPANION_HOME。`)
  process.exit(2)
}

register(new URL('./fw/ts-loader.mjs', import.meta.url))

const { parseExtensionManifest } = await import(pathToFileURL(join(framework, 'manifest.ts')).href)
const { dryMountWorld } = await import(pathToFileURL(join(framework, 'dry-mount.ts')).href)
const { checkDescribe } = await import(pathToFileURL(join(framework, 'describe-export.ts')).href)

const pkgDir = process.env.WORLD_PACKAGE_DIR ?? join(root, 'packages/cortico-world-dol')
const pkg = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'))
const { default: def } = await import(pathToFileURL(join(pkgDir, 'src/index.ts')).href)
const scratchDir = join(root, '.cache', 'fw-check', 'scratch')

const results = []

const manifest = parseExtensionManifest(pkg, 'zh')
results.push({
  name: 'manifest',
  ok: manifest.ok === true && manifest.warnings.length === 0,
  details: manifest.ok ? ['manifest ok'] : ['manifest 不合法'],
  warnings: manifest.warnings,
  failures: manifest.ok ? [] : [JSON.stringify(manifest)],
})

const mount = await dryMountWorld(def, {
  scratchDir,
  packageDir: pkgDir,
  language: 'zh',
  hasWebUiClient: existsSync(join(pkgDir, 'dist/webui.js')),
})
results.push({ name: 'dry-mount', ok: mount.failures.length === 0, details: mount.ok, warnings: mount.warnings, failures: mount.failures })

const describe = await checkDescribe('world', def, join(pkgDir, 'describe.json'), {
  scratchDir,
  packageDir: pkgDir,
  language: 'zh',
})
results.push({
  name: 'describe',
  ok: describe.failures.length === 0,
  details: describe.ok,
  warnings: describe.warnings,
  failures: describe.failures,
})

let failed = 0
for (const r of results) {
  console.log(`\n[${r.ok ? 'PASS' : 'FAIL'}] ${r.name}`)
  for (const line of r.details) console.log(`  ✓ ${line}`)
  for (const line of r.warnings) console.log(`  ! ${line}`)
  for (const line of r.failures) {
    console.log(`  ✗ ${line}`)
    failed++
  }
}

console.log(failed === 0 ? '\n全部通过。' : `\n${failed} 项失败。`)
process.exitCode = failed === 0 ? 0 : 1
