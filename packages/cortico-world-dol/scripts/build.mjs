/** World 包构建：把 webui/client.js 复制到 dist/webui.js（面板是手写 ESM，不需要打包）。 */
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = join(root, '..')
const dist = join(pkg, 'dist')

await mkdir(dist, { recursive: true })
await copyFile(join(pkg, 'webui/client.js'), join(dist, 'webui.js'))
console.log('built world dist/webui.js')
