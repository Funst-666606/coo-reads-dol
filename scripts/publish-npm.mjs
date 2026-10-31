#!/usr/bin/env node
/**
 * npm 发布脚本（在本地运行；沙箱环境不能 spawn，故未在此自动执行）。
 *
 * 用法：
 *   NPM_TOKEN=... node scripts/publish-npm.mjs                 # 只发学习版（sfw）
 *   NPM_TOKEN=... node scripts/publish-npm.mjs --variant full  # 只发完整版（需 --yes-i-know）
 *   NPM_TOKEN=... node scripts/publish-npm.mjs --variant both --yes-i-know
 *   node scripts/publish-npm.mjs --dry-run                     # 不发布，只打包检查
 *
 * 说明：
 * - 从 git worktree（sfw / main）取对应分支的包，不切换当前工作区；
 * - 构建 dist/webui.js，校验包名、版本、private、cortico.api、keywords；
 * - 用临时 npmrc（放在 .cache，gitignore 内）传 token，发布后删除；
 * - 完整版含 NSFW 档位，Cortico 官方市场会拉黑，默认不发布。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

function arg(name, fallback = null) {
  const i = args.indexOf(name)
  return i >= 0 ? (args[i + 1] ?? '') : fallback
}
function fail(message) {
  console.error(`\n[publish-npm] ${message}\n`)
  process.exit(1)
}
function run(cmd, cmdArgs, cwd, env = process.env) {
  const res = spawnSync(cmd, cmdArgs, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' })
  if (res.error) fail(`无法执行 ${cmd}：${res.error.message}`)
  if (res.status !== 0) fail(`${cmd} ${cmdArgs.join(' ')} 退出码 ${res.status}`)
}

const variant = arg('--variant', 'sfw')
const dryRun = args.includes('--dry-run')
const confirmed = args.includes('--yes-i-know')
const token = process.env.NPM_TOKEN

if (!['sfw', 'full', 'both'].includes(variant)) fail('--variant 只能是 sfw / full / both')
if (variant !== 'sfw' && !confirmed) {
  fail(
    '完整版包含 NSFW 评论档位，Cortico 官方市场会拉黑甚至封号。\n' +
      '确认要发布完整版请加 --yes-i-know；只发学习版用默认的 --variant sfw。',
  )
}
if (!dryRun && !token) {
  fail(
    '缺少 NPM_TOKEN。\n' +
      '请到 npmjs.com → Access Tokens 生成 Automation token（绕过 2FA），然后：\n' +
      '  PowerShell: $env:NPM_TOKEN="npm_..."; node scripts/publish-npm.mjs\n' +
      '  bash:       NPM_TOKEN=npm_... node scripts/publish-npm.mjs',
  )
}

const targets = variant === 'both' ? ['sfw', 'full'] : [variant]
const cache = join(root, '.cache')
mkdirSync(cache, { recursive: true })

for (const target of targets) {
  const branch = target === 'sfw' ? 'sfw' : 'main'
  const expected = target === 'sfw' ? 'cortico-world-dol-sfw' : 'cortico-world-dol'
  const dir = join(cache, `npm-publish-${target}`)
  const npmrc = join(cache, `.npmrc-${target}`)
  const pkgDir = join(dir, 'packages/cortico-world-dol')

  console.log(`\n=== ${target}：${expected}（分支 ${branch}）===`)
  rmSync(dir, { recursive: true, force: true })
  run('git', ['worktree', 'add', '--detach', dir, branch], root)

  try {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
    if (pkg.name !== expected) fail(`包名不对：${pkg.name}，预期 ${expected}`)
    if (pkg.private === true) fail('package.json 仍是 private:true，npm 会拒绝发布')
    if (!pkg.version) fail('缺少 version')
    if (pkg.cortico?.api !== 6) fail('cortico.api 必须是 6')
    if (!Array.isArray(pkg.keywords) || !pkg.keywords.includes('cortico-world')) {
      fail('缺少 cortico-world 关键字，市场不会收录')
    }

    if (target === 'sfw') {
      const variantFile = readFileSync(join(pkgDir, 'src/variant.ts'), 'utf8')
      if (!/SFW = true/.test(variantFile)) fail('sfw 分支的 variant.ts 不是 SFW=true')
    }

    console.log(`构建 ${pkg.name}@${pkg.version} …`)
    run('node', [join(pkgDir, 'scripts', 'build.mjs')], root)
    if (!existsSync(join(pkgDir, 'dist', 'webui.js'))) fail('构建后缺少 dist/webui.js')

    writeFileSync(
      npmrc,
      'registry=https://registry.npmjs.org/\n' +
        `//registry.npmjs.org/:_authToken=${token ?? 'dry-run'}\n`,
    )
    const env = {
      ...process.env,
      NPM_CONFIG_USERCONFIG: npmrc,
      NPM_CONFIG_CACHE: join(cache, 'npm'),
    }

    const publishArgs = ['publish', '--access', 'public', '--registry', 'https://registry.npmjs.org/']
    if (dryRun) publishArgs.push('--dry-run')
    run('npm', publishArgs, pkgDir, env)

    if (!dryRun) {
      console.log(`验证 ${pkg.name}@${pkg.version} …`)
      run('npm', ['view', `${pkg.name}@${pkg.version}`, 'version'], root, env)
      console.log(`已发布：https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`)
    }
  } finally {
    run('git', ['worktree', 'remove', '--force', dir], root)
    rmSync(npmrc, { force: true })
  }
}

console.log('\n[publish-npm] 完成。')
