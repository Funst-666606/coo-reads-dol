/**
 * 在进程内跑所有 *.test.ts。
 *
 * 不用 `node --test`：它会为每个文件起子进程，受限环境里 spawn 会 EPERM。
 * 这里直接 import，node:test 的 runner 会在同一进程里登记并执行。
 */
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const roots = ['packages']
const files = []

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) await walk(full)
    else if (e.name.endsWith('.test.ts')) files.push(resolve(full))
  }
}

for (const root of roots) await walk(root)
files.sort()

if (files.length === 0) {
  console.log('没有找到测试')
  process.exit(0)
}

for (const file of files) {
  console.log(`\n# ${file}`)
  await import(pathToFileURL(file).href)
}
