---
name: noise-reduction
description: >
  对话数据降噪（Noise Reduction）。诊断当前环境的噪声模式，编写降噪规则，验证降噪效果。
  适用于：首次搭建降噪流程、新增聊天渠道后更新规则、记忆召回质量下降的排查——如果向量搜索搜不到应该搜到的内容，可能是对话数据里噪声太多、搜索结果不相关、记忆库里垃圾信息太多。
  当用户表达类似意图时触发——不限于特定措辞。常见表达举例："降噪"、"清洗对话"、"noise reduction"、"信噪比"、"记忆力不行"、"搜不到东西"、"找不到过去的内容"、"搜索结果不相关"、"记忆乱七八糟"、"为什么搜出来的都不是我要的"、"对话记录太杂了"。
version: 0.5.0
author: MindCode
tags: [memory, noise-reduction, clawiser]
---

# Noise Reduction — 数据降噪

**信号 = 用户与 agent 的对话（双方发言）。其他一切 = 管道噪声。** 管道噪声包括工具调用、系统提示、metadata 注入、heartbeat 协议、JSON 输出、内部独白。

## 两层降噪架构

降噪在两个层面发生，顺序很重要——**先用结构化信号在入口处拦截，再用文本模式匹配清理余量。**

### Layer 1：Merge 入口层（结构化过滤，内置）

merge 脚本在读取 session 文件时，利用 `sessions.json` 的结构化元数据做第一轮过滤：

- **Session 类型过滤**：cron 和 subagent 类型的 session 整个跳过。这些是自动化输出，不是人机对话。判断依据是 `sessions.json` 中每个 session 的 `kind` / `type` 字段。
- **消息元数据过滤**：`delivery-mirror` 消息（`model === 'delivery-mirror'` 或 `provider === 'openclaw'`）被跳过。这些是内部投递确认，是 LLM 响应的副本。
- **归档文件支持**：`.jsonl.deleted.*` 和 `.jsonl.reset.*` 文件也会被读取——这些是 compaction 和 /new 操作归档的对话数据，包含真实内容。

**为什么在入口层做？** 因为这些信号是结构化的（JSON 字段、文件名 pattern），100% 确定，零误杀风险。在数据进入文本分析之前就拦截，既减少了后续处理量，也避免了用文本 pattern 去猜测 session 类型的脆弱性。

### Layer 2：文本模式匹配层（按环境配置）

经过 Layer 1 之后的数据仍然包含噪声——heartbeat、系统消息、工具输出、内部独白等。这些噪声的特征是**文本层面的**，需要 pattern matching 来识别。这就是本 skill 的核心工作：诊断你的环境有哪些噪声 pattern，编写对应的过滤规则。

**判断标准：** Layer 1 处理的是"这整个 session / 消息不该出现"（结构性排除），Layer 2 处理的是"这条消息的内容是噪声"（内容性过滤）。如果你发现某类噪声可以用结构化元数据 100% 确定，优先在 merge 脚本的入口层处理，而不是写文本 pattern。

## 前置条件

- 已执行 `memory-deposit`，有 merge 脚本和 transcripts 目录
- 至少有 1 天的原始 session JSONL 数据

## 执行模式

**默认分步执行。** 每步独立运行，步间通过文件传递状态。

- Run 1: Step 1-2（读 references + 跑诊断脚本）→ 输出 `memory/noise-profile-<date>.md`（~2 分钟）
- Run 2: Step 3（读噪声画像 + 写规则）→ 修改 merge 脚本（~4 分钟）
- Run 3: Step 4（跑验证脚本 + 判断）→ 输出验证结果（~2 分钟）

分步时不需要前序 session 的上下文——每步的输入和输出都是文件。

### 断点恢复

每步完成后写 `memory/noise-reduction-state.json`：

```json
{
  "version": "0.5.0",
  "startedAt": "2026-03-16T10:00:00Z",
  "targetDate": "2026-03-15",
  "completedSteps": [1, 2],
  "noiseProfilePath": "memory/noise-profile-2026-03-15.md",
  "mergeScriptBackup": true
}
```

**开始执行前先检查这个文件。** 如果存在，从 `completedSteps` 的下一步继续，不要重头开始。

全部完成（Step 4 通过）后删除 state 文件。Step 4 不通过时，把 `completedSteps` 回退到 `[1, 2]`，下次从 Step 3 重做。

### 超时自动处理

OpenClaw 默认每个 agent turn 限时 600 秒。如果单步执行超时被中断，state 文件保留了进度，下次触发时自动恢复。

如果某一步确实需要更长时间（如 Step 3 的 merge 脚本较复杂），可以用 gateway 工具临时调大超时：

```
gateway(action=config.patch, path="agents.defaults.timeoutSeconds", raw="900")
```

跑完后调回来：

```
gateway(action=config.patch, path="agents.defaults.timeoutSeconds", raw="600")
```

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

**完成后更新 state 文件**：`completedSteps: [1]`。

---

## 第 2 步：诊断噪声环境

### 运行诊断脚本

```bash
node scripts/diagnose-noise.js <YYYY-MM-DD> --out memory/noise-profile-<date>.md
```

脚本自动完成：读取 session JSONL、采样全量 user+assistant 消息、按已知 pattern 分类、检测环境特征。输出一份结构化噪声画像。

**⚠️ 脚本的分类是初步的（固定 pattern matching）。** 读完输出后，根据你对环境的了解补充脚本可能遗漏的噪声类型。特别注意：

- 脚本标注了"⚠️ 需要注意"的项目——这些是需要特殊处理的环境特征
- 脚本无法识别**上下文相关的噪声**（如 cron prompt 后面的 assistant 回复），会在报告中提示
- 检查"消息样本"段落，确认分类是否合理

**完成后更新 state 文件**：`completedSteps: [1, 2]`，`noiseProfilePath: "memory/noise-profile-<date>.md"`。

---

## 第 3 步：编写降噪规则

在 merge 脚本里编写过滤逻辑。

### 规则设计原则

1. **按 role 分流**：user 和 assistant 的噪声模式不同，分开处理。⚠️ 分类器中的用户/agent 标识要匹配实际名字（从 USER.md 和 IDENTITY.md 读取），不要硬编码通用称谓
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

修改 merge 脚本前，先备份当前版本：`cp merge-daily-transcript.js merge-daily-transcript.js.bak`。如果中途被中断，下次可以从备份恢复。

参考实现见 `references/example-classifier.md`。

**完成后更新 state 文件**：`completedSteps: [1, 2, 3]`，`mergeScriptBackup: true`。

---

## 第 4 步：验证降噪效果

### 运行验证脚本

```bash
node scripts/validate-noise-reduction.js <YYYY-MM-DD>
```

脚本自动完成：采集原始 user+assistant 消息、对比 transcript 产出、抽样、标注可疑项。输出一份结构化报告。

**⚠️ 脚本只产出报告，不产出 pass/fail 判定。你来判断。**

### 指标与目标

| 指标 | 定义 | 目标 |
|------|------|------|
| **压缩率** | user+assistant 消息中，被过滤条数 ÷ user+assistant 总条数 | 30%-60%（典型），60%-80%（高噪声环境可能正常） |
| **误杀率** | 被过滤消息中实际是对话的占比 | < 2% |
| **遗漏率** | 保留消息中实际是噪声的占比 | < 5% |

注意：压缩率只算 user 和 assistant 角色的消息。tool/system 等非对话角色由 merge 脚本的 role 过滤处理，不计入 noise-reduction 的压缩率。

### 读报告、做判断

1. 看报告的**压缩率**：在 30%-60% 区间内吗？
2. 看**被过滤消息抽样**：逐条检查，有没有真实对话被误杀？数误杀条数 ÷ 抽样总数 = 误杀率
3. 看**保留消息抽样**：逐条检查，有没有噪声被遗漏？数遗漏条数 ÷ 抽样总数 = 遗漏率
4. 重点关注报告中标 ⚠️ 的**可疑项**

### 不过时怎么办

**误杀率 > 2%**：
1. 列出所有被误杀的消息
2. 找到每条的 skip reason（merge 脚本的哪条规则触发的？）
3. 缩窄该规则的匹配范围，或加排除条件
4. 查 `references/common-failures.md` 的"误杀率 > 2%"段落，对照排查

**遗漏率 > 5%**：
1. 列出保留消息中的噪声
2. 按 `references/noise-categories.md` 分类——是哪类噪声？
3. 为每类遗漏写对应的过滤规则
4. 查 `references/common-failures.md` 的"遗漏率 > 5%"段落，对照排查

遗漏率超标不能用"保守原则"跳过——保守是指不确定的消息默认保留，不是指明确的噪声可以放过。

**压缩率判定**：
- 30%-60%：典型健康范围，直接看误杀率和遗漏率
- 60%-80%：高噪声环境可能出现（cron 任务多、heartbeat 频繁）。**检查误杀率——如果 < 2%，说明噪声确实多，压缩率合理，通过。** 不要试图把压缩率降到 60% 以下
- \> 80%：几乎肯定有误杀，查 `common-failures.md` 的"压缩率 > 80%"段落
- < 20%：规则覆盖不足，查 `common-failures.md` 的"压缩率 < 20%"段落

**调整后仍未达标**：记录当前结果和未解决的问题，不必追求完美——后续 merge 的统计输出会持续可见。Step 4 不通过需要重做 Step 3 时，更新 state 文件 `completedSteps: [1, 2]`。

首次验证结果记录到噪声画像。

**验证通过后删除 state 文件**（`memory/noise-reduction-state.json`），任务完成。

验证通过后，在 AGENTS.md 中写入：

```markdown
## 降噪状态
- 覆盖渠道：[Telegram / Discord / ...]
- 新增渠道时重跑 noise-reduction
- 用户反馈记忆力差 / 搜不到东西时，先检查降噪规则是否覆盖当前渠道，必要时重跑 noise-reduction
```

agent 每次启动读 AGENTS.md，自动感知渠道变化和记忆质量问题的排查路径。

---

## 依赖关系

- **前置**：`memory-deposit`（提供 merge 脚本和 transcripts 目录）
- **产出**：降噪规则 + 统计输出，写入 merge 脚本
