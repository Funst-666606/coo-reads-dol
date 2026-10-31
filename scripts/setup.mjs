/**
 * 首次准备：下载公开词表并生成词典模块。
 * 用法：node scripts/setup.mjs
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dict = join(root, 'packages/dol-mod/data/dict.json')

if (!existsSync(dict)) {
  console.log('没有 dict.json，开始下载词表…')
  await import(pathToFileURL(join(root, 'scripts/build-dict.mjs')).href)
} else {
  console.log('已有 data/dict.json，跳过下载')
}

await import(pathToFileURL(join(root, 'scripts/gen-data.mjs')).href)
console.log('准备完成。')
