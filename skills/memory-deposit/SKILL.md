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

本 skill 指导你补齐这两层，并建立标准目录结构。

## Step 1: 建立目录结构

检查并创建以下目录（已有的跳过）：

```bash
mkdir -p memory/transcripts   # 完整对话合并文档
mkdir -p memory/projects      # 项目文档（配合 save-game 使用）
mkdir -p memory/voice          # 语音对话记录（如果用了语音）
mkdir -p scripts               # 脚本
```

## Step 2: 安装对话合并脚本

把 `scripts/merge-daily-transcript.js` 复制到你的 workspace `scripts/` 目录。

这个脚本做的事：
1. 读取 `~/.openclaw/agents/main/sessions/` 下的 session JSONL
2. 过滤当天的消息
3. 降噪：去掉 heartbeat、cron prompt、工具输出、系统消息、RULE INJECTION 信封
4. 保留：人和 agent 的实质对话、语音转文字、回复引用
5. 合并同人同分钟的碎片消息
6. 按时间排序，多群来源合并，输出到 `memory/transcripts/YYYY-MM-DD.md`

## Step 3: 安装自动提交脚本

把 `scripts/auto-commit.sh` 复制到你的 workspace `scripts/` 目录。

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

## Step 4: 配置 Heartbeat

在 HEARTBEAT.md 里加两行：

```
# 对话合并
运行 node scripts/merge-daily-transcript.js $(date +%Y-%m-%d)

# Git 自动提交
运行 bash scripts/auto-commit.sh
```

每次 heartbeat 会自动：合并当天对话 + 提交未 commit 的变更。

## Step 5: 细化出厂记忆规则

在 AGENTS.md 里补充以下规则（出厂模板有基础版，你要细化）：

**每日笔记规则：**
- 记录所有决策及其理由
- 记录关键分歧和最终结论
- 记录踩过的坑和教训
- 记录重要的数字和时间节点

**长期记忆规则（MEMORY.md）：**
- 写入稳定的偏好和习惯
- 写入关键决策和原因
- 写入反复出现的教训
- 不要放临时状态

**Git 规则：**
- 修改正式文件后主动 commit
- auto-commit.sh 只是兜底
- 改坏了用 `git checkout -- <file>` 恢复

## Step 6: 确认向量召回

出厂自带，但需要有 embedding API key 才工作。执行 `memory_search(query="测试")` 确认能返回结果。如果不行，需要配一个 OpenAI / Gemini / Voyage 的 key。

## 安装自检

- [ ] `memory/transcripts/` 目录存在
- [ ] `memory/projects/` 目录存在
- [ ] `scripts/merge-daily-transcript.js` 已就位
- [ ] `scripts/auto-commit.sh` 已就位
- [ ] HEARTBEAT.md 里有 merge 和 auto-commit
- [ ] AGENTS.md 里有细化的记忆规则和 git 规则
- [ ] `git log` 有 commit 历史
- [ ] `memory_search` 能返回结果

## 目录结构全景

```
~/.openclaw/workspace/
├── AGENTS.md              # 补充记忆规则 + git 规则
├── HEARTBEAT.md           # 补充 merge + auto-commit
├── memory/
│   ├── YYYY-MM-DD.md      # 每日笔记（出厂自带）
│   ├── transcripts/       # 完整对话合并（本 skill）
│   ├── projects/          # 项目文档（本 skill）
│   └── voice/             # 语音记录（本 skill，可选）
├── scripts/
│   ├── merge-daily-transcript.js  # 对话合并（本 skill）
│   └── auto-commit.sh            # 自动提交（本 skill）
├── MEMORY.md              # 长期记忆（出厂自带）
└── .git/                  # 版本管理（本 skill）
```

## 与其他 ClaWise 模块的关系

- **noise-reduction**：第 4 层降噪的进阶策略
- **retrieval-enhance**：向量召回的高级用法（query expansion、reranking）
- **save-game / load-game**：依赖 `memory/projects/` 目录
- **project-skill-pairing**：依赖本 skill 建好的目录结构
