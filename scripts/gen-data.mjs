/**
 * 把 data/dict.json + data/roots.json 生成成 src/generated/data.ts。
 * 构建前跑一次；产物很大（约 0.5MB），但只在启动时解析一次。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = join(root, '..', 'packages/dol-mod')
const outDir = join(pkg, 'src/generated')

const dict = JSON.parse(await readFile(join(pkg, 'data/dict.json'), 'utf8'))
const roots = JSON.parse(await readFile(join(pkg, 'data/roots.json'), 'utf8'))

const header = `// ⚠️ 由 scripts/gen-data.mjs 生成，不要手改。
// 词典来源：${dict.source}（构建于 ${dict.builtAt}），词根表：自建。
`

const body = `${header}
/** word → [音标, 词性, 中文释义] */
export const DICT: Record<string, readonly [string, string, string]> = ${JSON.stringify(dict.words)}

export interface RootSeed {
  part: string
  type: 'prefix' | 'root' | 'suffix'
  meaning: string
  examples: string[]
}

export const ROOTS: readonly RootSeed[] = ${JSON.stringify(roots.entries)}
`

await mkdir(outDir, { recursive: true })
const out = join(outDir, 'data.ts')
await writeFile(out, body, 'utf8')
console.log(`wrote ${out} (${(Buffer.byteLength(body) / 1024).toFixed(0)} KB, ${Object.keys(dict.words).length} words)`)
