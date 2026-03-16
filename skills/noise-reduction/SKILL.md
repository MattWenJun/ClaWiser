---
name: noise-reduction
description: 对话数据降噪。诊断当前环境的噪声模式，编写降噪规则，验证降噪效果。适用于已有 memory-deposit 的 merge 脚本但需要优化降噪质量的场景，也适用于从零搭建降噪流程。当用户说"降噪"、"清洗对话"、"noise reduction"、"信噪比"时触发。
version: 0.1.0
author: Matt (MindCode)
tags: [memory, noise-reduction, clawise]
---

# Noise Reduction — 数据降噪

**信号 = 用户与 agent 的对话（双方发言）。其他一切 = 管道噪声。** 管道噪声包括工具调用、系统提示、metadata 注入、heartbeat 协议、JSON 输出、内部独白。

## 前置条件

- 已执行 `memory-deposit`，有 merge 脚本和 transcripts 目录
- 至少有 1 天的原始 session JSONL 数据

---

## 第 1 步：理解噪声分类

session 原始数据里的内容分两类：

| 保留 | 清掉 |
|------|------|
| 用户发言 | 系统消息（`[System Message]`、Compaction、Queued announce） |
| agent 发言 | 协议噪声（heartbeat、cron prompt、`NO_REPLY`） |
| | 元数据注入（`Conversation info`、`RULE INJECTION`、`Sender metadata`） |
| | 工具输出（JSON、文件路径、纯数字、`done`） |
| | 内部独白（`Now let me…`、`Let me check…`） |

详细的噪声类型和识别特征见 `references/noise-categories.md`。

---

## 第 2 步：诊断噪声环境

取最近 1 天的原始 session JSONL，采样分析。

1. 随机抽取 80-120 条消息（覆盖 user 和 assistant）
2. 每条判断：对话还是管道？
3. 管道消息归类到 `references/noise-categories.md` 的类别

输出噪声画像，存到 `memory/`：

```markdown
## 噪声画像 — [日期]

- 采样总数: N | 对话: X (Y%) | 管道: X (Y%)

### 噪声分布
| 类别 | 条数 | 占噪声% | 典型 pattern |
|------|------|---------|-------------|
| 元数据注入 | | | |
| 工具输出 | | | |
| 协议噪声 | | | |
| 系统消息 | | | |
| 内部独白 | | | |

### 环境特征
- 渠道: [Telegram / Discord / ...]
- 群聊: [是/否]
- 特殊 pattern: [如有]
```

---

## 第 3 步：编写降噪规则

在 merge 脚本里编写过滤逻辑。

### 规则设计原则

1. **按 role 分流**：user 和 assistant 的噪声模式不同，分开处理
2. **先处理量大的**：从噪声画像占比最高的类别开始
3. **保守过滤**：不确定的消息默认保留。误保留的代价远小于误杀
4. **标注 reason**：每条规则标注过滤原因（如 `skip('heartbeat')`）

### ⚠️ 元数据包裹的特殊处理

渠道注入的元数据（如 `RULE INJECTION`、`Conversation info`）可能**包裹着真实用户文本**。不能整条丢弃——先剥离元数据，检查剩余内容是否为空，有内容则保留。

### 统计输出

在 merge 脚本末尾加统计，每次执行自动打印：

```
[noise-reduction] 原始: 847 条 | 保留: 412 条 | 压缩率: 48.6%
[noise-reduction] skip 分布: heartbeat=89, cron_prompt=67, tool_json=134, ...
```

参考实现见 `references/example-classifier.md`。

---

## 第 4 步：验证降噪效果

| 指标 | 定义 | 目标 |
|------|------|------|
| **压缩率** | 降噪后条数 ÷ 原始条数 | 30%-60% |
| **误杀率** | 被过滤消息中实际是对话的占比 | < 2% |
| **遗漏率** | 保留消息中实际是噪声的占比 | < 5% |

操作：
1. 记录降噪前总条数、降噪后条数 → 压缩率
2. 从被过滤的消息中抽 30 条，判断有无误杀 → 误杀率
3. 从保留的消息中抽 30 条，判断有无遗漏 → 遗漏率

判定：
- 压缩率 < 20% → 规则太少
- 压缩率 > 80% → 规则太激进，检查误杀
- 误杀率 > 2% → 回第 3 步调整
- 遗漏率 > 5% → 补充规则

首次验证结果记录到噪声画像。

---

## 依赖关系

- **前置**：`memory-deposit`（提供 merge 脚本和 transcripts 目录）
- **产出**：降噪规则 + 统计输出，写入 merge 脚本
