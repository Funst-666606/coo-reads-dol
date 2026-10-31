#!/usr/bin/env node
/**
 * npm 发布脚本（在本地运行）。
 *
 * 用法：
 *   npm login && node scripts/publish-npm.mjs              # 用已登录的 npm 账号
 *   NPM_TOKEN=... node scripts/publish-npm.mjs             # 用 Automation token
 *   NPM_TOKEN=... node scripts/publish-npm.mjs --variant full --yes-i-know
 *   node scripts/publish-npm.mjs --dry-run
 *
 * 只从 git worktree（sfw / main）取包，不切换当前工作区。
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
  const res = spawnSync(cmd, cmdArgs, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
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

// 没有 token 时允许使用已登录的 npm 账号
let useToken = Boolean(token)
if (!dryRun && !token) {
  const who = spawnSync('npm', ['whoami'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (who.status !== 0) {
    fail(
      '没有 NPM_TOKEN，也没有检测到 npm 登录。\n' +
        '两种方式任选：\n' +
        '  1) 先运行：npm login，登录后再运行本脚本；\n' +
        '  2) 设置 NPM_TOKEN（npmjs.com → Access Tokens → Automation）。',
    )
  }
  console.log(`使用已登录的 npm 账号：${(who.stdout || '').trim()}`)
  useToken = false
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

    let env = { ...process.env, NPM_CONFIG_CACHE: join(cache, 'npm') }
    if (useToken) {
      writeFileSync(
        npmrc,
        'registry=https://registry.npmjs.org/\n' +
          `//registry.npmjs.org/:_authToken=${token}\n`,
      )
      env = { ...env, NPM_CONFIG_USERCONFIG: npmrc }
    }

    const publishArgs = ['publish', '--access', 'public', '--registry', 'https://registry.npmjs.org/']
    if (dryRun) publishArgs.push('--dry-run')
    run('npm', publishArgs, pkgDir, env)

    if (!dryRun) {
      console.log(`已提交发布：${pkg.name}@${pkg.version}`)
      console.log('等待 registry 同步（最多约 2 分钟）…')
      let verified = false
      for (let i = 0; i < 8; i++) {
        const check = spawnSync('npm', ['view', `${pkg.name}@${pkg.version}`, 'version'], {
          cwd: root,
          env,
          encoding: 'utf8',
          shell: process.platform === 'win32',
        })
        if (check.status === 0) {
          verified = true
          break
        }
        await new Promise((r) => setTimeout(r, 15_000))
      }
      if (verified) {
        console.log(`已发布：https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`)
      } else {
        const latest = spawnSync('npm', ['view', pkg.name, 'version'], {
          cwd: root,
          env,
          encoding: 'utf8',
          shell: process.platform === 'win32',
        })
        const latestVersion = String(latest.stdout || '').trim()
        if (latestVersion === '0.0.0-stage') {
          console.warn(
            `\n[publish-npm] 这是 npm 的「分阶段发布」（staged publish）。\n` +
              `当前公开版本只是占位符 0.0.0-stage，真实版本 ${pkg.version} 还在等待审批。\n` +
              '请到 npmjs.com → 左侧 Staged Packages（或包设置里的 Staged Releases）用 2FA 批准。\n' +
              '批准后 0.0.0-stage 会被 0.1.5 替换，再运行：\n' +
              `  npm view ${pkg.name} version\n`,
          )
        } else {
          console.warn(
            `\n[publish-npm] 发布命令已成功，但 registry 尚未同步 ${pkg.name}@${pkg.version}。\n` +
              '这不是失败：npm 页面通常几分钟内出现。稍后用下面命令确认：\n' +
              `  npm view ${pkg.name} version\n`,
          )
        }
      }
    }
  } finally {
    run('git', ['worktree', 'remove', '--force', dir], root)
    try {
      rmSync(npmrc, { force: true })
    } catch {
      /* 忽略 */
    }
  }
}

console.log('\n[publish-npm] 完成。')
