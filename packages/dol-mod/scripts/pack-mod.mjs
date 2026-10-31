/** 把 dist/ 压成 DoL ModLoader 认的 .mod.zip（boot.json 在根目录）。 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = join(root, '..')
const dist = join(pkg, 'dist')
const out = join(pkg, 'CooBridge.mod.zip')

const names = (await readdir(dist)).sort()
const files = {}
for (const name of names) {
  files[name] = new Uint8Array(await readFile(join(dist, name)))
}
for (const extra of ['README.md', 'LICENSE']) {
  files[extra] = new Uint8Array(await readFile(join(pkg, extra)))
}

if (!files['boot.json']) throw new Error('dist/boot.json 不存在，先跑 build')
const zipped = zipSync(files, { level: 9 })
await writeFile(out, zipped)
console.log(`packed ${out} (${names.join(', ')})`)
