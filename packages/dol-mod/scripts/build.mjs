/** 把模组打成单个 IIFE 文件，并复制 boot.json / CSS 到 dist/。 */
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundle } from './bundle.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = join(root, '..')
const dist = join(pkg, 'dist')

await mkdir(dist, { recursive: true })

const result = await bundle({
  entry: join(pkg, 'src/main.ts'),
  outfile: join(dist, 'CooBridge.js'),
})
console.log(`bundled ${result.modules.join(' + ')} (${(result.bytes / 1024).toFixed(1)} KB)`)

await copyFile(join(pkg, 'boot.json'), join(dist, 'boot.json'))
await copyFile(join(pkg, 'src/coobridge.css'), join(dist, 'CooBridge.css'))
console.log('built dist/')
