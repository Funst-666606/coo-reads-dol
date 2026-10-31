/**
 * 打包发布产物到 release/：
 * - cortico-world-dol-<ver>.zip：World 扩展（解压后从本机目录安装）
 * - CooBridge.mod.zip：DoL 模组（原样拷贝）
 * - 安装说明.md、SHA256SUMS.txt
 */
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { zipSync } from 'fflate'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const worldPkg = join(root, 'packages/cortico-world-dol')
const modPkg = join(root, 'packages/dol-mod')
const release = join(root, 'release')
const stage = join(release, 'cortico-world-dol')

// 先构建
await import(pathToFileURL(join(root, 'scripts/build-all.mjs')).href)

const pkg = JSON.parse(await readFile(join(worldPkg, 'package.json'), 'utf8'))
const modPkgJson = JSON.parse(await readFile(join(modPkg, 'package.json'), 'utf8'))
const version = pkg.version
const modVersion = modPkgJson.version

await rm(release, { recursive: true, force: true })
await mkdir(stage, { recursive: true })

// 只放 files 里声明的 + package.json（npm 打包语义）
const files = ['package.json', ...(pkg.files ?? [])]
async function walk(dir, base = dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full, base)))
    else out.push(relative(base, full).split('\\').join('/'))
  }
  return out
}

const included = []
for (const item of files) {
  const full = join(worldPkg, item)
  const info = await stat(full)
  if (info.isDirectory()) {
    await cp(full, join(stage, item), { recursive: true })
    included.push(...(await walk(full)).map((p) => `${item}/${p}`))
  } else {
    await cp(full, join(stage, item))
    included.push(item)
  }
}

// 目录结构检查：没有漏掉入口与面板产物
for (const required of ['package.json', 'src/index.ts', 'src/ENV_PROMPT.md', 'dist/webui.js', 'describe.json']) {
  if (!included.includes(required)) throw new Error(`打包缺文件：${required}`)
}

const zipEntries = {}
async function collect(dir, base = dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await collect(full, base)
    else zipEntries[`cortico-world-dol/${relative(base, full).split('\\').join('/')}`] = new Uint8Array(await readFile(full))
  }
}
await collect(stage)

const worldZip = join(release, `cortico-world-dol-${version}.zip`)
await writeFile(worldZip, zipSync(zipEntries, { level: 9 }))
console.log(`wrote ${relative(root, worldZip)} (${Object.keys(zipEntries).length} files)`)

// mod zip 原样拷贝
const modZipName = 'CooBridge.mod.zip'
await cp(join(modPkg, modZipName), join(release, modZipName))
console.log(`copied ${modZipName}`)

// 安装说明
const readme = `# 安装说明（World ${version} · 模组 ${modVersion}）

## 包含

- \`cortico-world-dol-${version}.zip\`：Coopanion 的 World 扩展。解压后得到 \`cortico-world-dol/\` 目录。
- \`CooBridge.mod.zip\`：DoL 的 ModLoader 模组，**不要解压**，直接给 Mod 管理器加载。

## 一、装 World（Coopanion）

1. 把 \`cortico-world-dol-${version}.zip\` 解压到任意固定目录（例如 \`D:\\coo-ext\\\`），得到
   \`D:\\coo-ext\\cortico-world-dol\\\`。
2. Coopanion → **World extensions** → 手动安装 → **从本机目录安装** → 选上面那个目录。
3. **重启 Coopanion**（扩展要重启进程才加载）。
4. World 总览里启用「DoL 陪读」。
5. 打开「DoL 陪读」页，确认面板能显示；默认端口 17321。

> 不要改目录名或移动它：本机目录是 link 安装，移动后要重新安装。

## 二、装模组（游戏）

1. 用**英文原版**游戏（ModLoader 构建，**不要**装 ModI18N 汉化包）。
2. 游戏左下角 **Mod 管理器** → 添加旁加载 Mod → 选 \`CooBridge.mod.zip\` → 重新载入。
3. 右下角出现 \`Coo\` 圆点，绿色 = 已连接。

## 三、验证

1. 游戏 F12 控制台应出现 \`[CooBridge] 已加载 0.1.0，游戏 0.5.12.13\`。
2. 点单词 → 单词卡（音标/释义/词根/同根词）。
3. **Alt + 点击**句子 → Coo 翻译与讲解（20 秒内）。
4. 圆点 → 面板：生词、复习、导出、自检。

## 注意

- **只支持英文原版**；检测到汉化包会显示「CooBridge 已停用」并完全不连接。
- 仅 Windows + 本地 html；GitHub Pages 在线版与安卓 APK 连不上本机服务。
- 生词与翻译缓存存在游戏浏览器的 localStorage；清站点数据会丢，先导出。
- 本包不含 Degrees of Lewdity 的游戏正文或译文；词典数据仅供本地学习使用，
  发布/分发前请阅读仓库 \`docs/发布前检查.md\` 的许可说明。
- 出问题先看同目录的 \`故障排查.md\`，或把游戏内「复制自检」发我。
`
await writeFile(join(release, '安装说明.md'), readme, 'utf8')
await cp(join(root, 'docs/故障排查.md'), join(release, '故障排查.md'))
await cp(join(root, 'docs/联调验收.md'), join(release, '联调验收.md'))

// 校验和
const sums = []
for (const name of [`cortico-world-dol-${version}.zip`, modZipName]) {
  const bytes = await readFile(join(release, name))
  sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`)
}
await writeFile(join(release, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`, 'utf8')

console.log(`release ready: ${relative(root, release)}`)
