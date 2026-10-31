/**
 * 一次构建全部产物：World 面板 + mod 包 + zip。
 * 需要先生成词典模块（node scripts/setup.mjs）。
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const generated = join(root, 'packages/dol-mod/src/generated/data.ts')

if (!existsSync(generated)) {
  console.error('缺少 packages/dol-mod/src/generated/data.ts')
  console.error('请先运行：node scripts/setup.mjs')
  process.exit(1)
}

// 不能用 execFileSync（受限环境 spawn EPERM）；直接 import 各个构建脚本。
await import(pathToFileURL(join(root, 'packages/cortico-world-dol/scripts/build.mjs')).href)
await import(pathToFileURL(join(root, 'packages/dol-mod/scripts/build.mjs')).href)
await import(pathToFileURL(join(root, 'packages/dol-mod/scripts/pack-mod.mjs')).href)
