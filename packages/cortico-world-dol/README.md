# cortico-world-dol

Cortico World 扩展：把 **Degrees of Lewdity 英文原版**的场景交给 Coo，并把玩家点选的句子/单词转给 Coo
讲解，再把答复送回游戏。

- 本地服务：`127.0.0.1:17321`（被占向上顺延）
- 协议：`packages/protocol` v1
- 只支持英文原版；检测到汉化由模组先拦
- 需要游戏侧安装 `CooBridge.mod.zip`

## 工具

| 工具 | 作用 |
|---|---|
| `dol_teach` | 回传某条学句请求的翻译与讲解 |
| `dol_define` | 回传某条查词请求的释义/词根 |
| `dol_now` | 当前场景与连接状态 |
| `dol_mode` | 读取/切换 主动/触发/被动 |
| `dol_vocab` | 生词统计、最近加入、今天到期 |

## 事件

`dol.connected` / `dol.disconnected` / `dol.scene` / `dol.choice` / `dol.ask` / `dol.word_ask` / `dol.vocab`

## 配置（`worlds.dol.*`）

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `false` | 在 World 页手动启用 |
| `port` | `17321` | 本地端口 |
| `mode` | `trigger` | 主动 / 触发 / 被动 |
| `maxCommentsPerDay` | `40` | 0 = 不限 |
| `sceneTextLimit` | `4000` | 发给 Coo 的正文字符上限 |
| `replyTimeoutSec` | `20` | 等 Coo 回传的超时 |
