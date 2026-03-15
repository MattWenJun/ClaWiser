---
name: memory-deposit
description: 为 OpenClaw agent 搭建完整的 6 层记忆系统。出厂自带前 3 层 + 向量召回，本 skill 补齐缺失的层（对话合并、目录约定、Git 版本管理），让 agent 真正能记住、能恢复、能回溯。
version: 0.1.0
author: Matt (MindCode)
tags: [memory, foundation, clawise]
requires: []
layer: foundation
---

# Memory Deposit — 记忆沉淀

## 这个 Skill 解决什么问题

OpenClaw 出厂有记忆能力，但不完整：

- **Compaction 丢细节**：对话上下文满了就压缩，agent 会丢失讨论细节和决策过程
- **每日笔记是摘要不是原文**：agent 写的是主观摘要，重要对话的原文找不回来
- **没有版本历史**：文件改了就改了，改坏了没法恢复

本 skill 在出厂的基础上，补齐缺失的层，构成完整的 6 层记忆系统。

## 6 层记忆架构

### 第 1 层：对话上下文 ✅ 出厂自带

当前对话窗口里的内容。OpenClaw 自动管理，不用配。
- 优点：什么都在，实时可用
- 缺点：compaction 一来就压缩，细节丢失

### 第 2 层：每日笔记 ✅ 出厂自带

出厂 AGENTS.md 模板已包含规则：每天在 `memory/YYYY-MM-DD.md` 记录当天重要事项。

**你要做的（细化，不是从零搭）：**
告诉你的 agent 什么值得记。比如在 AGENTS.md 里补充：
```
记录规则：
- 所有决策及其理由
- 讨论中的关键分歧和最终结论
- 学到的教训（踩过的坑）
- 重要的数字和时间节点
```

### 第 3 层：长期记忆 ✅ 出厂自带

出厂模板已包含 `MEMORY.md` 机制：agent 定期从每日笔记中提炼长期记忆。

**你要做的（细化）：**
定义什么算"值得长期保留"。在 AGENTS.md 里补充：
```
长期记忆规则：
- 稳定的偏好和习惯（不会每周变的）
- 关键决策和原因（为什么选 A 不选 B）
- 反复出现的教训
- 不要放临时状态（那是每日笔记的事）
```

### 第 4 层：完整对话合并 ⚡ 需要搭建

**问题：** 每日笔记是摘要，不是原文。重要的讨论细节、决策过程、追问逻辑会丢失。

**解决：** 每天把所有对话合并成一个完整文档。

**目录：** `memory/transcripts/YYYY-MM-DD.md`

**执行方式：**
1. 安装本 skill 附带的 `scripts/merge-daily-transcript.js`，复制到你的 workspace `scripts/` 目录下
2. 在 HEARTBEAT.md 里加一行：`运行 node scripts/merge-daily-transcript.js $(date +%Y-%m-%d)`
3. 脚本会自动：读取 session JSONL → 降噪（去掉工具输出、系统消息、heartbeat 等）→ 格式化为可读的 Markdown → 写入 `memory/transcripts/`

**降噪规则（脚本内置）：**
- 跳过：heartbeat prompt/ack、cron 触发消息、纯工具输出、系统消息、RULE INJECTION 信封
- 保留：人和 agent 的实质对话、语音转文字内容、回复引用
- 合并：同一人同一分钟内的碎片消息合并为一条

**多源合并：**
- 如果你有多个群/对话，脚本会把所有来源整合到一份文档里，按时间排序
- 每条消息标注时间、来源群组
- 语音消息（如果你有 `memory/voice/YYYY-MM-DD.jsonl`）也会整合进去

### 第 5 层：向量召回 ✅ 出厂自带（可能需要确认配置）

OpenClaw 内置向量索引，默认启用，监控 `memory/` 目录变化自动 re-index。

**检查是否工作：**
- 需要有一个 embedding provider 的 API key（OpenAI / Gemini / Voyage 等）
- OpenClaw 自动检测已配置的 key，按优先级选择
- 如果你只配了 Anthropic key，embedding 没有 provider，需要额外配一个

**确认方法：** 让 agent 执行 `memory_search(query="测试")`，如果返回结果就说明在工作。

> 向量召回的高级用法（query expansion、LLM reranking）属于 `retrieval-enhance` skill 的范围。

### 第 6 层：Git 版本管理 ⚡ 需要搭建

**问题：** 文件改了就改了，agent 覆盖了重要内容没法恢复。

**解决：** 把整个 workspace 纳入 git 管理。

**执行步骤：**

1. **初始化 git（如果还没有）：**
```bash
cd ~/.openclaw/workspace
git init
```

2. **建 .gitignore：**
```
# 临时文件
tmp/
*.tmp
*.bak
.DS_Store

# 太大的自动生成文件（可选排除）
# memory/transcripts/*.md

# 敏感信息
.env
.env.*
*.secrets

# Node
node_modules/
```

3. **安装自动提交脚本：**
把本 skill 附带的 `scripts/auto-commit.sh` 复制到你的 workspace `scripts/` 目录。
在 HEARTBEAT.md 里加一行：`运行 bash scripts/auto-commit.sh`

4. **在 AGENTS.md 里加规则：**
```
Git 规则：
- 修改正式文件后主动 commit
- auto-commit.sh 只是兜底，不替代手动判断
- 改坏了用 git checkout -- <file> 恢复
```

## 目录约定

安装本 skill 后，你的 workspace 应该有以下结构（加粗的是本 skill 新增的）：

```
~/.openclaw/workspace/
├── AGENTS.md                    # 出厂自带，本 skill 补充记忆规则
├── SOUL.md                      # 出厂自带
├── USER.md                      # 出厂自带
├── TOOLS.md                     # 出厂自带
├── IDENTITY.md                  # 出厂自带
├── MEMORY.md                    # 出厂自带
├── HEARTBEAT.md                 # 出厂自带，本 skill 补充 merge + auto-commit
├── memory/
│   ├── YYYY-MM-DD.md            # 出厂自带（每日笔记）
│   ├── transcripts/             # ⚡ 本 skill 新增（完整对话合并）
│   │   └── YYYY-MM-DD.md
│   ├── voice/                   # ⚡ 本 skill 新增（语音对话记录，可选）
│   │   └── YYYY-MM-DD.jsonl
│   └── projects/                # ⚡ 本 skill 新增（项目文档，配合 save-game 使用）
│       └── <project-name>/
│           └── HANDOFF.md
├── scripts/                     # ⚡ 本 skill 新增
│   ├── merge-daily-transcript.js
│   └── auto-commit.sh
└── .git/                        # ⚡ 本 skill 新增
```

## 安装检查清单

装完后，让你的 agent 做一轮自检：

- [ ] `memory/` 目录存在，有日期命名的 .md 文件
- [ ] `MEMORY.md` 存在且有内容
- [ ] `memory/transcripts/` 目录已创建
- [ ] `memory/projects/` 目录已创建
- [ ] `scripts/merge-daily-transcript.js` 已就位
- [ ] `scripts/auto-commit.sh` 已就位
- [ ] HEARTBEAT.md 里有 merge 和 auto-commit 的执行行
- [ ] `git log` 能看到 commit 历史
- [ ] AGENTS.md 里有记忆规则和 git 规则
- [ ] `memory_search(query="测试")` 能返回结果（向量召回在工作）

## 不要做的事

- ❌ 不要在存储上搞花样——.md 文件 + git 就是目前最好的方案
- ❌ 不要跳过降噪直接存原始 session JSONL——噪声会严重影响检索质量
- ❌ 不要手动编辑 `memory/transcripts/` 里的文件——它们是自动生成的
- ❌ 不要把 secrets 提交到 git

## 与其他 ClaWise 模块的关系

- **noise-reduction**：第 4 层降噪的进阶策略
- **retrieval-enhance**：第 5 层向量召回的高级用法（query expansion、reranking）
- **save-game / load-game**：依赖本 skill 建好的 `memory/projects/` 目录
- **project-skill-pairing**：依赖本 skill 建好的目录结构
