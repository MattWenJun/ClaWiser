# 常见噪声类型清单

按来源分类。不是所有类型都会出现在你的环境里——用第 2 步的采样分析确认哪些与你相关。

## 平台级噪声（OpenClaw 产生）

| 噪声 | 来源 | 识别特征 |
|------|------|---------|
| Heartbeat prompt | 定时心跳机制 | 包含 `Read HEARTBEAT.md` |
| Heartbeat ack | agent 心跳回复 | 完整消息为 `HEARTBEAT_OK` |
| Cron prompt | 定时任务触发 | 以 `[cron:UUID]` 开头 |
| Compaction 消息 | 上下文压缩机制 | 包含 `Post-Compaction Audit`、`Pre-compaction memory flush` |
| 系统消息 | 平台控制信号 | 包含 `[System Message]`、`Queued announce` |
| 静默回复 | agent 无需回复时 | 完整消息为 `NO_REPLY` |

## 渠道级噪声（聊天平台注入）

| 噪声 | 来源 | 识别特征 |
|------|------|---------|
| Telegram metadata | Telegram 群聊 | `Conversation info (untrusted metadata)` JSON 块 |
| Sender metadata | Telegram 群聊 | `Sender (untrusted metadata)` JSON 块 |
| RULE INJECTION | OpenClaw 路由层 | `⚠️ RULE INJECTION` 块包裹用户消息 |
| Discord embed | Discord 消息 | embed 对象、bot prefix、slash command echo |
| WhatsApp receipt | WhatsApp 消息 | delivery/read receipt、group notification |

**注意**：渠道级噪声往往**包裹着真实用户文本**。处理这类噪声时，要先剥离外壳提取用户文本，不能整条丢弃。

## 工具级噪声（工具调用产生）

| 噪声 | 来源 | 识别特征 |
|------|------|---------|
| JSON 输出 | 工具返回值 | 以 `{` 或 `[` 开头的 JSON |
| 文件列表 | 文件系统操作 | 每行以 `/` 开头的路径 |
| 纯数字 | 计算/统计工具 | 整条消息只有数字 |
| trivial 回复 | 工具确认 | `done`、`(no output)` |

## Agent 内部噪声

| 噪声 | 来源 | 识别特征 |
|------|------|---------|
| 内部独白 | agent 思考过程 | `Now let me…`、`Let me check…`、`I'll …` 开头 |
| 短片段 | 不完整输出 | 长度极短且无实质内容（但需排除中文短回复和 emoji 标记） |

## 跨环境差异提示

- **单聊 vs 群聊**：群聊多了 sender metadata 和引用消息格式
- **语音消息**：转写后的语音消息是对话（signal），但转写元数据（`[Audio] User text:` 前缀等）是噪声
- **多 session**：merge 多个 session 时，不同 session 的系统消息格式可能不同
