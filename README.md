# 欲都孤鱼与多邻鱼

<p align="center"><img src="assets/icon.png" width="112" alt="icon"></p>

<p align="center">
  <b>Coo × Degrees of Lewdity</b><br>
  让桌宠 Coo 坐进游戏里：查词、词根、整句讲解、生词复习，或者只陪你玩。
</p>

<p align="center">
  <a href="https://github.com/Funst-666606/coo-reads-dol/releases">下载</a> ｜
  <a href="#安装">安装</a> ｜
  <a href="#使用说明">使用</a> ｜
  <a href="#常见问题">常见问题</a> ｜
  <a href="#开发">开发</a>
</p>

> 作者：Funst-666606（QQ：烦伪2674459204）｜许可证：CC BY-NC-SA 4.0｜18+

---

## 这是什么

这是一个 **Coopanion 的 World 扩展** + **Degrees of Lewdity 的 ModLoader 模组** 的组合：

- **World** 负责把 Coo 接进来：读游戏场景、生成评论、查词、翻译、批改生词；
- **DoL 模组** 负责在游戏里显示：Coo 圆点、单词卡、句子卡、生词面板、设置；
- 两者通过本机 `ws://127.0.0.1:17321` 通信，不经过任何服务器。

装好之后，你在游戏里点一个单词或一句英文，Coo 会在气泡里用中文讲解；你也可以让它像同伴一样对剧情做短评。

## 两个版本

| | 完整版 | 学习版 |
|---|---|---|
| 包名 | `cortico-world-dol` | `cortico-world-dol-sfw` |
| 评论态度 | 严谨 / 正常 / 含蓄 / 色情 / 淫乱 | 锁定「严谨」 |
| 成人内容 | 可在设置开启，默认关闭 | 不可用，入口显示为「开发者模式」 |
| 适合 | 想按自己口味陪玩 | 只想学英语、或准备上架 Cortico 市场 |

两个版本共用同一个 DoL 模组（`CooBridge.mod.zip`）。

## 功能

### 点词卡

- 音标、词性、中文释义；
- 词根拆解与同根词（本地 184 条词根表，查不到就明确显示“无可靠词根”）；
- 本地词典未收录时，点「问 Coo 这个词」让 Coo 补全；
- 本地词典已收录时，也一样能问，本地与 Coo 的内容**分两块并存**；
- 支持加入生词本、朗读、跳去问整句。

### 问 Coo 这个词

单词卡永远有「问 Coo 这个词」：

- Coo 会补充语境、搭配、易混点；
- 回答按「词 + 句子」缓存，同一句里第二次点开秒出；
- 可点「再问一次 Coo」重新请求；
- 生词本里可以用 Coo 的释义覆盖旧释义。

### 整句讲解

- **Alt + 点击** 一句英文，或**选中一段英文**；
- Coo 回传中文翻译 + 1–3 条讲解（语法、语气、地道用法）；
- 同一句第二次点开直接读缓存；
- 失败会提示超时/未连接，不会卡在“正在想”。

### 生词本与复习

- 加入、编辑释义、删除；
- 导入 `.json` / `.csv`，导出 JSON / CSV；
- 间隔复习：1 / 2 / 4 / 7 / 15 / 30 天；
- 复习时选「认识 / 模糊 / 不认识」，自动安排下一次；
- Coo 改过的词带 `Coo` 标签，可「只看 Coo 改动」；
- 数据存在游戏浏览器 localStorage，清理站点数据会丢，建议定期导出。

### 朗读

- 单词卡上的 🔊 使用系统语音合成，离线；
- 优先选本地英文嗓音，语速 0.6–1.3 可调；
- 不支持语音合成的环境会提示一次，不影响其他功能。

### 陪玩与评论态度

三种陪读模式：

- **主动**：会主动评论剧情、提醒复习；
- **触发**：只在换场景 / 做选择时说一句；
- **被动**：只有你点词 / 点句时才说话。

五档评论态度：

- 严谨：只陈述事实与语言信息；
- 正常：按 Coo 自己的性格；
- 含蓄：点到为止的暧昧；
- 色情 / 淫乱：成人内容，需手动开启「成人内容」开关，默认关闭。

态度只作用于**本游戏内的评论、翻译与提醒**，不会带到 Coo 的其他对话。

### 非学习模式

只想玩、不想学英语时：

- 在 Coo 面板点「学习英语」切到「只陪玩」；
- 或对 Coo 说「只想玩」；
- 点词、Alt+点句、生词、复习全部关闭，只保留 Coo 的剧情评论。

### 首次引导

第一次连上时，Coo 会自己问：

> 想学英语，还是只想一起玩？

回答后它调用 `dol_setup` 保存，之后可在面板随时切换。

### 汉化环境

检测到中文正文 / ModI18N 时：

- **不再停用模组**；
- 自动切换为非学习模式，并在顶部显示可关闭的提示；
- 想恢复学习模式：圆点 → 设置 → 打开「学习英语模式」。

## 系统要求

- Windows 10 / 11；
- Coopanion 0.2.16 或更新（自带 Cortico，world api 6）；
- Degrees of Lewdity **0.5.12.13**（ModLoader 2.101.1 构建），英文原版；
- 安装 World 时需要联网（从 npm 装依赖或从本地目录装均可，**新版本不需要 node_modules**）。

不支持：GitHub Pages 在线版（https 连不上本机 ws）、安卓 APK（手机连不到 PC 的本机服务）。

## 安装

### 一、安装 World（Coopanion）

**方式 A：GitHub Release（推荐）**

1. 打开 [Releases](https://github.com/Funst-666606/coo-reads-dol/releases)；
2. 下载对应 World：
   - 完整版：`cortico-world-dol-0.1.16.zip`
   - 学习版：`cortico-world-dol-sfw-0.1.8.zip`
3. 解压到**固定目录**，例如 `D:\coo-ext\`，得到 `cortico-world-dol\` 或 `cortico-world-dol-sfw\`；
4. Coopanion → **扩展** → 从本机目录安装 → 选这个目录；
5. **重启 Coopanion**；
6. 到 World 总览启用「欲都孤鱼与多邻鱼」。

> 不要把 zip 留在 Downloads 里直接选 zip；要先解压。目录不要改名或移动，本机目录是 link 安装。

**方式 B：npm（仅学习版）**

学习版已发布到 npm：

```bash
npm view cortico-world-dol-sfw version
```

在 Coopanion 扩展市场搜索 `cortico-world-dol-sfw` 安装，或：

```bash
cd <Coopanion>/data/extensions
pnpm add cortico-world-dol-sfw
```

### 二、安装 DoL 模组

1. 使用带 ModLoader 的**英文原版**游戏；
2. 打开游戏，按 `Alt+M`（或左下 Mod 管理器）→ 添加旁加载 Mod；
3. 选 `CooBridge.mod.zip` → 添加 → **重新载入**；
4. 右下角出现 `Coo` 圆点，绿色表示已连接到 World。

不要解压 `CooBridge.mod.zip`，也不要使用 GitHub 的 `Source code (zip)`。

### 三、验证安装

1. F12 控制台应有：`[CooBridge] 已加载 0.1.16，游戏 0.5.12.13`；
2. 点单词 → 出现单词卡；
3. Alt+点击句子 → 20 秒内出翻译；
4. 圆点 → 面板能打开；
5. 首次连接 Coo 会问「学英语 / 只想玩」。

## 使用说明

### 游戏内

| 操作 | 效果 |
|---|---|
| 点单词 | 单词卡：音标、词性、释义、词根、同根词 |
| 点「问 Coo 这个词」 | Coo 补充语境与搭配，与本地词典并存 |
| Alt+点击句子 | Coo 翻译 + 讲解 |
| 选中一段英文 | 同上 |
| 点 🔊 | 朗读单词 |
| 圆点 | 打开面板：生词 / 复习 / 设置 |
| Alt+M | 打开 Mod 管理器 |

### Coo 面板

- **生词**：查看、手动添加、编辑、删除、导入 JSON/CSV、导出；
- **复习**：认识 / 模糊 / 不认识；
- **设置**：
  - 学习英语模式（关闭 = 只陪玩）
  - 点词查义开关
  - Alt+点击问句开关
  - 单词卡朗读开关与语速
  - 端口（改完重新载入游戏生效）
  - 重连、清空翻译缓存、自检/复制诊断

### Coo 侧面板（Coopanion）

「欲都孤鱼与多邻鱼」页：

- 连接状态、端口、当前场景、今日评论数、生词镜像；
- 陪读模式：主动 / 触发 / 被动；
- 玩法与态度：总开关、学习英语、评论态度、成人内容、主持模式（占位）；
- 生词镜像表：词、释义、到期、box、掌握；
- 导出 CSV / JSON、刷新。

## 设置项

World 配置在 `worlds.dol.*`：

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `false` | 总开关；关闭后不评论、不响应事件 |
| `learning` | `true` | 学习英语模式；`false` = 只陪玩 |
| `attitude` | `normal` | `strict` / `normal` / `subtle` / `erotic` / `lewd` |
| `adult` | `false` | 开启后才可用色情 / 淫乱 |
| `onboarded` | `false` | 是否已完成首次选择 |
| `port` | `17321` | 游戏连接的端口，被占用时向上试 9 个 |
| `mode` | `trigger` | 主动 / 触发 / 被动 |
| `maxCommentsPerDay` | `0` | 0 = 不限 |
| `sceneTextLimit` | `4000` | 发给 Coo 的正文字符上限 |
| `replyTimeoutSec` | `20` | 等 Coo 回传的超时秒数 |

学习版会把 `attitude` 强制为 `strict`，并隐藏 `adult` 项。

## 数据与备份

- 生词、设置、翻译缓存都在游戏浏览器的 localStorage；
- 清理站点数据 / 换浏览器 / 换设备会丢失；
- 卸载模组前先：面板 → 设置 → 导出 JSON；
- World 侧只保留只读镜像 `dataDir/dol-vocab.json`，不反向覆盖游戏内词库。

## 常见问题

**提示 `Cannot find package 'ws'`**

旧版 World 的依赖缺失。升级到 **0.1.16 / 学习版 0.1.8** 或更新：已移除 `ws`，本机目录安装不再需要 `node_modules`。

**提示 `ERR_PNPM_FETCH_404 ... 0.1.6.tgz`**

该版本还没同步到 npm，或已被 staged。装 release 里的本地 zip，或等 `npm view` 显示该版本。

**圆点一直不绿 / 频繁断连**

1. 确认 Coopanion 在运行、World 已启用；
2. 确认端口一致（默认 17321）；
3. **只开一个游戏页面**（两个页面会互相顶掉）；
4. 升级到模组 0.1.16+（心跳 15 秒、静默超时 120 秒、回前台补发心跳）；
5. F12 看 `[CooBridge] 连接关闭 code=...`：
   - `1006`：页面关闭/网络断；
   - `4001`：被另一个页面接管；
   - `4002`：hello 超时。

**游戏自己跳回 Start**

这不是 WS 断开，而是游戏页面被刷新/重载。F12 勾选 **Preserve log**，看是否出现页面导航；如果是其他模组导致崩溃，先禁用其他模组二分排查。

**检测到汉化，模组还能用吗**

能。不会停用，只会自动切非学习模式并提示；可在设置里切回学习模式。

**扩展页显示 `0.0.0-stage`**

npm staged 发布占位。到 npm 的 **Staged Packages** 批准真实版本；或改用 `npm login` 后重新发布新版本。

**生词会不会同步到别的设备**

不会。生词在游戏浏览器本地；跨设备请导出 JSON 再导入。

## 开发

```bash
pnpm install
node scripts/setup.mjs                     # 首次：下载词表并生成词典模块
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node scripts/test.mjs                      # 92 个测试
node scripts/build-all.mjs                 # 构建 World 面板 + mod + zip
node scripts/gen-describe.mjs              # 改工具/事件后重生成 describe
pnpm publish:npm:sfw                       # 发布学习版到 npm
```

框架校验（需要本机 Coopanion）：

```powershell
$env:COOPANION_HOME='C:\path\to\Coopanion'
node scripts/fw-check.mjs
```

### 目录

| 路径 | 内容 |
|---|---|
| `packages/cortico-world-dol` | Coopanion World 扩展 |
| `packages/dol-mod` | DoL ModLoader 模组 |
| `packages/protocol` | 两端共享的 WS 协议 |
| `scripts` | 构建、测试、发布脚本 |
| `docs` | 需求、技术方案、验收、排障 |
| `release` / `release-sfw` | 构建产物（gitignore） |

### 分支

- `main`：完整版；
- `sfw`：学习版（评论锁定严谨、开发者模式不可用）。

## 版本

| 组件 | 当前 |
|---|---|
| World（完整版） | 0.1.16 |
| World（学习版） | 0.1.8 |
| DoL 模组 | 0.1.16 |

发布记录见 [Releases](https://github.com/Funst-666606/coo-reads-dol/releases) 与各包 `CHANGELOG.md`。

## 许可证与声明

- 许可证：**CC BY-NC-SA 4.0**（全文见 [LICENSE](LICENSE)）；
- 不包含 Degrees of Lewdity 的游戏正文、图片或中文本地化译文；游戏本体为 CC BY-NC-SA 4.0；
- 词典数据由公开词表在本地生成，不随仓库分发；
- 成人内容：运行在 18+ 游戏；「色情 / 淫乱」档位默认关闭；
- **AI 声明**：运行时的评论与翻译由 Coo 的 LLM 生成，按交互文本估算约占 60%；其余 40% 为本地词库、词根、UI 与固定文案。代码为 AI 辅助编写。

## 反馈

请附上：

1. 游戏内 设置 → **复制自检** 的全文；
2. F12 里所有 `[CooBridge]` 开头的日志；
3. Coopanion 版本、World 版本、模组版本、游戏版本；
4. 如果是断连，注明关闭码（`code=`）。

仓库：https://github.com/Funst-666606/coo-reads-dol
