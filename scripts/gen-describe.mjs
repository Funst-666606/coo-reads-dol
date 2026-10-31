/**
 * 生成 describe.json（扩展市场与 check:extension 读它）。
 * 形状对齐框架的 exportDescribe：{ tools, events, prompts }，prompts 内嵌 ENV_PROMPT.md 正文。
 * 用法：node scripts/gen-describe.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = join(root, '..', 'packages/cortico-world-dol')

const mod = await import(pathToFileURL(join(pkg, 'src/index.ts')).href)
const def = mod.default
if (!def?.describe) throw new Error('WorldDefinition.describe 不存在')

// 与框架 dry-mount 一样：用默认配置构造一次，取 webUi('zh') 的 envPrompt 文档。
const world = def.create({
  cfg: def.defaults(),
  dataDir: join(root, '..', '.cache', 'describe'),
  timezone: 'Asia/Taipei',
  persist: () => {},
})

const docs = (world.webUi?.('zh')?.promptDocs ?? []).filter((doc) => doc.role === 'envPrompt')
const prompts = []
for (const doc of docs) {
  prompts.push({
    key: doc.key,
    title: doc.title,
    ...(doc.role ? { role: doc.role } : {}),
    content: await readFile(doc.path, 'utf8'),
  })
}

const file = {
  tools: [...def.describe.tools],
  events: [...def.describe.events],
  ...(prompts.length ? { prompts } : {}),
}

await writeFile(join(pkg, 'describe.json'), `${JSON.stringify(file, null, 2)}\n`, 'utf8')
console.log(`wrote describe.json (${file.tools.length} tools, ${file.events.length} events, ${prompts.length} prompts)`)
