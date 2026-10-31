# coo-reads-dol · DoL 陪读

让 Coo 坐在屏幕边陪你玩 **DoL 英文原版**，并在游戏里加一层可以随时开关的英语精读层：
读英文 → 点词看释义与词根 → 点句让 Coo 翻译讲解 → 进生词本 → 按间隔复习。

## 现在到哪了

| 里程碑 | 状态 |
|---|---|
| M0 需求 / 技术方案 | ✅ [需求规格](docs/需求规格.md)｜[技术方案](docs/技术方案.md) |
| M1 通信骨架 | ✅ 协议 v1、本地 WS 服务、模组端连接与场景同步 |
| M2 装进 Coopanion 联调 | ⏳ 需要你手动装一次（见下） |
| M3 查词 / 词根 / 生词本 | ✅ 已实现（7809 词本地词典 + 184 条词根 + 单词卡 + 生词本），待游戏内验证 |
| M4 点句问 Coo | ✅ 已实现（Alt+点击或选中文本，带缓存与超时），待验证 |
| M5 复习 / 导出 | ✅ 已实现（1/2/4/7/15/30 天，JSON/CSV 导出） |
| M6 World 面板 / 生词镜像 | ✅ 已实现（连接状态、模式切换、镜像列表、导出、配置组），待 Coopanion 内验证 |
| 测试 | 90 个（协议、WS 端到端、World 集成、bundle ↔ World 全链路 E2E、jsdom 游戏内 UI/设置/面板、失败路径、朗读、Coo 改词库、扩展入口、zip 结构、自描述、场景读取、版本探测、汉化检测、查词、词根、SRS、生词本、CSV） |
| 框架校验 | ✅ 用 Coopanion 自带的 `manifest` / `dry-mount` / `describe` 三项校验，全过（`node scripts/fw-check.mjs`） |
| 联调 | 见 [联调验收清单](docs/联调验收.md)｜[故障排查](docs/故障排查.md) |

## 怎么用（游戏内）

- **点单词** → 单词卡：音标、词性、释义、词根拆解、同根词、加入生词本。
- 单词卡永远有「问 Coo 这个词」：本地词典与 Coo 的释义/词根**并存**（分两块显示），可再用 Coo 的释义更新生词本。
- 单词卡右上角 **🔊** 朗读（系统语音合成，离线；优先本地英文嗓音）。
- 本地词典没收录 → 卡片上「问 Coo 这个词」，Coo 回传后标注「AI 推测」并缓存。
- **Alt + 点击**，或**选中一段英文** → 问句卡：Coo 给中文翻译 + 1–3 条讲解；同一句第二次点秒开。
- 右下角 `Coo` 圆点 → 面板：生词（可手动添加、编辑、导入 JSON/CSV、导出）、复习（认识/模糊/不认识）、设置（端口、导出、清缓存、重连、诊断）。
- **设置**页可开关：点词查义、Alt+点击问句、单词朗读；朗读语速 0.6–1.3 可调（存在游戏本地）。
- 也可以直接对 Coo 说「把这个词加进生词本 / 删掉 / 我记住了」——它通过 `dol_vocab_edit` 改游戏内的词库。
- 模式（主动/触发/被动）在 Coopanion 的 World 设置里改；World 面板也能切。
- Coopanion 的「DoL 陪读 → 陪读」页：连接状态、端口、当前场景、今日评论数、生词镜像与导出。

## 两个包

| 目录 | 是什么 | 装在哪 |
|---|---|---|
| `packages/cortico-world-dol` | Cortico World 扩展（`cortico-world`） | Coopanion → World extensions → 手动安装 → 从本机目录安装 |
| `packages/dol-mod` | DoL ModLoader 模组，产物 `CooBridge.mod.zip` | 游戏左下角 Mod 管理器 → 添加旁加载 Mod |
| `packages/protocol` | 两端共用的 WS 协议（单一事实来源） | 不单独发布 |

`packages/*/src/protocol.ts` 由 `scripts/sync-protocol.mjs` 从 `packages/protocol` 复制生成，**不要直接改**。

## 开发命令

```bash
pnpm install

node scripts/setup.mjs                                           # 首次：下载公开词表并生成词典模块（需联网一次）
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit   # typecheck
node scripts/test.mjs                                            # 单测（进程内跑）
node scripts/build-all.mjs                                       # 构建 mod + 打 zip
node scripts/sync-protocol.mjs                                   # 改完协议后同步
node scripts/gen-describe.mjs                                    # 改完工具/事件后重生成 describe.json
$env:COOPANION_HOME='C:\path\to\Coopanion'; node scripts/fw-check.mjs   # 用 Coopanion 自带的框架做安装前校验
```

> `data/dict.json` 与 `src/generated/` 不进版本库：它们由公开词表在本机生成，
> 发布前需按 [发布前检查](docs/发布前检查.md) 换成可再分发的数据源。

本机沙箱不允许起子进程（`spawn EPERM`），所以：

- 不用 `vitest` / `node --test`（都会起 worker/子进程），测试用 `node:test` 在进程内直接 import；
- 不用原生 `esbuild`/`rollup`，`packages/dol-mod/scripts/bundle.mjs` 是一个 80 行的自制打包器（TS `transpileModule` + 模块表）；
- 依赖用 `nodeLinker: hoisted` 安装（Node 在 Windows 上从 junction 路径解析依赖会失败）；
- 游戏内 UI 用 jsdom 做真实 DOM 测试（`packages/dol-mod/test/ui.test.ts`），不依赖浏览器。

## 打包

```bash
node scripts/package-release.mjs
```

产出 `release/`：

| 文件 | 用途 |
|---|---|
| `cortico-world-dol-<版本>.zip` | Coopanion 扩展；解压后「从本机目录安装」 |
| `CooBridge.mod.zip` | DoL 模组；Mod 管理器直接加载，**不要解压** |
| `安装说明.md` | 交给使用者的步骤与注意事项 |
| `SHA256SUMS.txt` | 两个包的校验和 |

打包后会先构建；解压出来的扩展目录已用 Coopanion 自带框架校验过
（`WORLD_PACKAGE_DIR=<解压目录> node scripts/fw-check.mjs`，三项 PASS）。

## 手工联调（第一次）

1. **装 World**：Coopanion → World extensions → 手动安装 → 从本机目录安装 → 选
   `packages/cortico-world-dol` → 重启 Coopanion → 在 World 总览里启用「DoL 陪读」。
2. **装模组**：打开游戏（英文原版，**不要**装汉化包）→ 左下角 Mod 管理器 → 添加旁加载 Mod →
   选 `packages/dol-mod/CooBridge.mod.zip` → 重新载入。
3. **按清单逐项打勾**：[联调验收](docs/联调验收.md)。出问题取「设置 → 复制自检」发我。

## 已知限制

- 只支持英文原版；检测到 `ModI18N` 或中文语言即停用。
- 仅 Windows + 本地 html；在线版/安卓连不上 `127.0.0.1`。
- 端口默认 `17321`，被占时向上顺延 9 个；mod 会依次尝试。
- 不打包任何游戏正文或译文。
- 词典由公开四六级/托福词表在本地生成（`data/dict.json` 不进版本库）；**发布前必须换可再分发的数据源**，或改为用户自备。
