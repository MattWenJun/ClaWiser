---
name: noise-reduction
description: 对话数据降噪。诊断当前环境的噪声模式，编写降噪规则，验证降噪效果。适用于已有 memory-deposit 的 merge 脚本但需要优化降噪质量的场景，也适用于从零搭建降噪流程。当用户说"降噪"、"清洗对话"、"noise reduction"、"信噪比"时触发。
version: 0.1.0
author: Matt (MindCode)
tags: [memory, noise-reduction, clawise]
---

# Noise Reduction — 数据降噪

原则：**信号 = 用户与 agent 的对话。其他一切 = 管道噪声。**

对话记录里混着大量管道数据：工具调用、系统提示、metadata 注入、heartbeat 协议、JSON 输出、内部独白。这些在对话界面上用户看不见，但原始 session 数据里全都在。不清洗就存，后续的向量索引、记忆搜索、项目回顾全会被噪声淹没。

做与不做，记忆召回质量差 3-5 倍。

> "Identify the smallest set of high-signal tokens that maximize desired outcomes."
> — Anthropic, *Effective Context Engineering for AI Agents*

本 skill 不给你一套固定规则。**它教你诊断自己的环境、写自己的规则、验证自己的效果。** 因为每个 agent 的宿主环境不同——用的聊天渠道不同（Telegram / Discord / WhatsApp / Signal / Slack / Feishu），OpenClaw 配置不同，接入的工具不同，噪声模式就不同。

## 前置条件

- 已执行 `memory-deposit`，有 merge 脚本和 transcripts 目录
- 至少有 1 天的原始 session JSONL 数据

---

## 第 1 步：理解噪声分类

对话 session 的原始数据里，混着以下几类内容：

| 类别 | 说明 | 示例 |
|------|------|------|
| **对话** | 用户和 agent 的实际交流 | "帮我总结一下这篇文章" / "好的，这篇文章主要讲了三点…" |
| **系统消息** | 平台注入的控制信息 | `[System Message]`、`Post-Compaction Audit`、`Pre-compaction memory flush` |
| **协议噪声** | 心跳、确认、调度信号 | `HEARTBEAT_OK`、heartbeat prompt、`NO_REPLY`、cron prompt |
| **元数据注入** | 渠道注入的上下文 | `Conversation info (untrusted metadata)`、`Sender (untrusted metadata)`、`RULE INJECTION` |
| **工具输出** | 工具调用的原始返回 | JSON blob、文件路径列表、纯数字、`done`、`(no output)` |
| **内部独白** | agent 的自我思考过程 | "Now let me check…"、"Let me read…" |

你要保留的只有第一类：**对话**（用户和 agent 双方的发言）。其余全部是管道，清掉。

---

## 第 2 步：诊断你的噪声环境

取最近 1 天的原始 session 数据，做一次采样分析。

### 操作

1. 找到 session JSONL 文件（通常在 OpenClaw 的 sessions 目录下）
2. 随机抽取 80-120 条消息（覆盖 user 和 assistant 两种 role）
3. 对每条消息判断：这是**对话**还是**管道**？
4. 管道消息进一步分类：属于上表的哪个类别？

### 输出：噪声画像

```markdown
## 噪声画像 — [日期]

- 采样总数: N 条
- 对话(signal): X 条 (Y%)
- 管道(noise): X 条 (Y%)

### 噪声来源分布
| 类别 | 条数 | 占总噪声% | 典型 pattern |
|------|------|----------|-------------|
| 元数据注入 | | | |
| 工具输出 | | | |
| 协议噪声 | | | |
| 系统消息 | | | |
| 内部独白 | | | |

### 环境特征
- 聊天渠道: [Telegram / Discord / ...]
- 是否有群聊: [是/否]
- 主要工具: [列出常用工具]
- 特殊噪声模式: [如有]
```

把噪声画像存到 `memory/` 或项目文档里，后续迭代时对比用。

---

## 第 3 步：编写降噪规则

基于噪声画像，在 merge 脚本里编写过滤逻辑。

### 规则设计原则

1. **按 role 分流**：user 消息和 assistant 消息的噪声模式不同，分开处理
2. **先处理量大的**：从噪声画像里占比最高的类别开始写规则
3. **保守过滤**：不确定的消息默认保留。误保留（多存了噪声）的代价远小于误杀（丢了对话）
4. **规则要有 reason**：每条过滤规则标注原因（如 `skip('heartbeat')`），merge 脚本结束时统计各 reason 的 skip 数量并输出

### 常见噪声 pattern

以下是跨环境常见的噪声特征，供参考。你的环境可能有额外的 pattern，也可能没有其中某些。

**User 消息中的噪声：**
- Cron 调度：以 `[cron:` 开头，或包含 cron UUID
- 系统消息：包含 `[System Message]`、`Post-Compaction`、`Pre-compaction`
- 心跳 prompt：包含 `Read HEARTBEAT.md if it exists`
- 元数据包裹：以 `Conversation info (untrusted metadata)` 或 `⚠️ RULE INJECTION` 开头——这类消息里可能**包裹着真实用户文本**，需要先剥离元数据再判断剩余内容是否为空

**Assistant 消息中的噪声：**
- 心跳确认：`HEARTBEAT_OK`
- 静默回复：`NO_REPLY`、`done`、`(no output)`
- 工具输出：纯 JSON、纯数字、文件路径列表
- 内部独白：以 `Now let me`、`Let me check` 等开头的自我对话

### 统计输出

在 merge 脚本末尾加一段统计，每次执行自动打印：

```
[noise-reduction] 原始: 847 条 | 保留: 412 条 | 压缩率: 48.6%
[noise-reduction] skip 分布: heartbeat=89, cron_prompt=67, tool_json=134, ...
```

这段统计是后续迭代的数据基础——不需要你记得去复查，每次 merge 跑完都能看到。

参考实现见 `references/example-classifier.md`。

---

## 第 4 步：验证降噪效果

规则写完后，**必须验证**。不验证的规则不可信。

### 量化指标

| 指标 | 定义 | 目标 |
|------|------|------|
| **压缩率** | 降噪后条数 ÷ 原始条数 | 30%-60%（取决于环境噪声量） |
| **误杀率** | 被过滤的消息中，实际是对话的占比 | < 2% |
| **遗漏率** | 保留的消息中，实际是噪声的占比 | < 5% |

### 操作

1. 拿降噪前的原始数据，记录总条数
2. 跑降噪规则，记录过滤后条数 → 算出压缩率
3. 从**被过滤的消息**中随机抽 30 条，人工判断有没有被误杀的对话 → 算误杀率
4. 从**保留的消息**中随机抽 30 条，人工判断有没有漏过的噪声 → 算遗漏率

### 判定

- 压缩率在 30%-60% → 正常
- 压缩率 < 20% → 规则可能太少，噪声没滤干净
- 压缩率 > 80% → 规则可能太激进，检查有没有误杀
- 误杀率 > 2% → 回第 3 步调整规则
- 遗漏率 > 5% → 补充规则

把首次验证的结果（压缩率、误杀率、遗漏率）作为**基线**记录到噪声画像里。

---

## 第 5 步：在 merge 脚本中加入偏移检测

noise-reduction 不是常驻服务——跑一次，产出规则，结束。但规则会随环境变化而过时。在 merge 脚本里加一段偏移检测逻辑，让 merge 自己发现问题：

### 检测逻辑（写在 merge 脚本里）

每次 merge 执行后，对比当前统计与基线：

- **压缩率偏离基线超过 15 个百分点**
- **出现未识别的噪声 pattern**（无法归类到已有 reason）
- **某个 reason 的 skip 数量突然归零**（上游格式可能变了）

### 触发动作

偏移检测到异常时，merge 脚本输出警告标记。agent 在 heartbeat 中看到警告后：

1. **自动重跑 noise-reduction**（第 2-4 步）：重新诊断环境、调整规则、验证效果
2. 新规则写入 merge 脚本，下次 merge 自动生效
3. **如果连续 2 次自动修复后偏移仍未收敛** → 告警用户，说明需要人工介入

用户日常不感知这个过程。只有 agent 自己修不好时才会被打扰。

---

## 与 memory-deposit 的关系

- **memory-deposit** 负责搭建记忆系统的基础设施（merge 脚本、目录结构、Git、向量索引）
- **noise-reduction** 负责优化 merge 过程中的降噪质量
- 本 skill 的产出（降噪规则）写在 memory-deposit 的 merge 脚本里
- 如果你还没跑过 memory-deposit，先去跑——没有 merge 脚本，降噪无处落地
