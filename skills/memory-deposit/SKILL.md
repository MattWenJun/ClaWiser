---
name: memory-deposit
description: 搭建完整的 6 层记忆系统。OpenClaw 出厂自带前 3 层 + 向量召回，本 skill 补齐第 4 层（完整对话合并）和第 6 层（Git 版本管理），并建立标准目录约定。安装后 agent 能真正记住细节、恢复上下文、回溯历史。
version: 0.1.0
author: Matt (MindCode)
tags: [memory, foundation, clawise]
requires: []
layer: foundation
---

# Memory Deposit — 记忆沉淀

## 你要做什么

OpenClaw 出厂给了你 3 层记忆（对话上下文、每日笔记、长期记忆）+ 向量召回。但还缺两层：

- **第 4 层**：完整对话合并（每日笔记是你的摘要，不是原文，细节会丢）
- **第 6 层**：Git 版本管理（文件改了就改了，改坏了没法恢复）

本 skill 补齐这两层，建立标准目录结构。全程自动执行，无需用户介入。

---

## 安装流程（一口气执行完）

### Step 1: 建立目录结构

```bash
mkdir -p memory/transcripts   # 完整对话合并文档
mkdir -p memory/projects      # 项目文档（配合 save-game 使用）
mkdir -p memory/voice          # 语音对话记录
mkdir -p scripts               # 脚本
```

### Step 2: 安装对话合并脚本

把本 skill 附带的 `scripts/merge-daily-transcript.js` 复制到 workspace 的 `scripts/` 目录。

脚本功能：
- 读取 `~/.openclaw/agents/main/sessions/` 下的 session JSONL
- 降噪：去掉 heartbeat、cron prompt、工具输出、系统消息、RULE INJECTION 信封
- 保留：人和 agent 的实质对话、语音转文字、回复引用
- 合并同人同分钟的碎片消息，按时间排序
- 多群来源合并到一个文件
- 输出到 `memory/transcripts/YYYY-MM-DD.md`

### Step 3: 安装自动提交 + Git 初始化

把本 skill 附带的 `scripts/auto-commit.sh` 复制到 workspace 的 `scripts/` 目录。

如果 workspace 还没有 git：
```bash
cd ~/.openclaw/workspace
git init
```

建 `.gitignore`：
```
tmp/
*.tmp
*.bak
.DS_Store
.env
.env.*
*.secrets
node_modules/
```

### Step 4: 配置 Heartbeat

在 HEARTBEAT.md 里追加：

```markdown
# 对话合并
运行 node scripts/merge-daily-transcript.js $(date +%Y-%m-%d)

# Git 自动提交
运行 bash scripts/auto-commit.sh
```

### Step 5: 确认向量召回

执行 `memory_search(query="测试")`。

- **有结果** → 向量召回在工作，跳过。
- **无结果或报错** → 需要 embedding API key。告诉用户：

> 记忆系统搭好了，但向量搜索需要一个 embedding API key 才能工作。你有 OpenAI、Gemini 或 Voyage 的 key 吗？配上之后我就能通过语义搜索找到历史对话了。

OpenClaw 会自动检测已配置的 key（优先级：local → openai → gemini → voyage → mistral）。用户配好后再跑一次确认。

---

## 安装自检

全部完成后，过一遍这个清单：

- [ ] `memory/transcripts/` 目录存在
- [ ] `memory/projects/` 目录存在
- [ ] `scripts/merge-daily-transcript.js` 已就位
- [ ] `scripts/auto-commit.sh` 已就位
- [ ] HEARTBEAT.md 有 merge 和 auto-commit
- [ ] `git log` 有 commit 历史
- [ ] `memory_search` 能返回结果

---

## 安装后建议

安装完成后，建议在 AGENTS.md 里细化记忆规则，让每日笔记和长期记忆更有针对性。比如：明确什么值得记（决策、教训、关键数字）、什么不记（临时状态、已完成的待办）。这不是必须步骤，但做了效果更好。

---

## 目录结构

```
~/.openclaw/workspace/
├── AGENTS.md
├── HEARTBEAT.md           # 补充 merge + auto-commit
├── memory/
│   ├── YYYY-MM-DD.md      # 每日笔记（出厂自带）
│   ├── transcripts/       # 完整对话合并（本 skill）
│   ├── projects/          # 项目文档（本 skill）
│   └── voice/             # 语音记录（本 skill）
├── scripts/
│   ├── merge-daily-transcript.js
│   └── auto-commit.sh
├── MEMORY.md              # 长期记忆（出厂自带）
└── .git/                  # 版本管理（本 skill）
```

## 与其他 ClaWise 模块的关系

- **noise-reduction**：对话合并降噪的进阶策略
- **retrieval-enhance**：向量召回的高级用法（query expansion、reranking）
- **save-game / load-game**：依赖 `memory/projects/`
- **project-skill-pairing**：依赖本 skill 的目录结构
