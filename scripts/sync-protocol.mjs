/** 把 packages/protocol 的单一事实来源复制到各包，避免安装时依赖 workspace 协议。 */
import { readFile, writeFile } from 'node:fs/promises'

const here = new URL('.', import.meta.url)
const source = new URL('../packages/protocol/src/index.ts', here)
const targets = [
  new URL('../packages/cortico-world-dol/src/protocol.ts', here),
  new URL('../packages/dol-mod/src/protocol.ts', here),
]

const header =
  '// ⚠️ 由 scripts/sync-protocol.mjs 生成，不要直接改。\n' +
  '// 单一事实来源：packages/protocol/src/index.ts\n\n'

const body = await readFile(source, 'utf8')
for (const target of targets) {
  await writeFile(target, header + body, 'utf8')
  console.log(`synced ${target.pathname}`)
}
