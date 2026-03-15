---
name: memory-deposit
description: 检查并补齐 6 层记忆系统。检查当前 workspace 的记忆配置是否完整，缺什么补什么。已完成则报告状态，未完成则引导逐步配置。可反复执行。
version: 0.2.0
author: Matt (MindCode)
tags: [memory, foundation, clawise]
requires: []
layer: foundation
---

# Memory Deposit — 记忆沉淀

检查 workspace 的 6 层记忆系统是否完整，缺什么补什么。

## 检查清单

按顺序逐项检查。已完成的跳过，未完成的执行对应步骤。

### 1. 目录结构

检查以下目录是否存在：
- `memory/transcripts/`
- `memory/projects/`
- `memory/voice/`
- `scripts/`

缺的直接 `mkdir -p` 创建。

### 2. 对话合并脚本

检查 `scripts/merge-daily-transcript.js` 是否存在。

不存在 → 从本 skill 的 `scripts/` 目录复制过来。

### 3. Git 版本管理

检查 workspace 是否有 `.git/`。

不存在 →
```bash
cd ~/.openclaw/workspace
git init
```
写入 `.gitignore`（排除 tmp/、.env*、*.secrets、node_modules/、.DS_Store），执行首次提交。

已存在 → 检查 `.gitignore` 是否包含上述排除项，缺的补上。

### 4. 自动提交脚本

检查 `scripts/auto-commit.sh` 是否存在。

不存在 → 从本 skill 的 `scripts/` 目录复制过来。

### 5. Heartbeat 配置

检查 HEARTBEAT.md 是否包含对话合并和自动提交的执行行。

缺的追加：
```markdown
# 对话合并
运行 node scripts/merge-daily-transcript.js $(date +%Y-%m-%d)

# Git 自动提交
运行 bash scripts/auto-commit.sh
```

### 6. 记忆规则

检查 AGENTS.md 是否包含 `## 记忆规则` 段落。

不存在 → 追加：

```markdown
## 记忆规则

### 每日笔记（memory/YYYY-MM-DD.md）
记录：
- 所有决策及其理由（为什么选 A 不选 B）
- 关键分歧和最终结论
- 踩过的坑和教训
- 重要的数字、时间节点、外部信息

不记录：临时状态、已完成的琐碎待办、工具调用中间输出

### 长期记忆（MEMORY.md）
定期从每日笔记提炼，写入：
- 稳定的偏好和习惯
- 关键决策和原因
- 反复出现的教训和模式
- 重要的人、项目、关系

不写入：临时进展、可能很快过时的信息

### Git 规则
- 修改正式文件后主动 commit
- auto-commit.sh 只是兜底，不替代主动判断
- 改坏了用 `git checkout -- <file>` 恢复
- tmp/ 下的文件不提交
```

写入后告诉用户：已把记忆规则写进 AGENTS.md，后续可以根据需要调整。

### 7. 向量召回

执行 `memory_search(query="测试")`。

- **有结果** → 在工作，完成。
- **无结果或报错** → 告诉用户：

> 向量搜索需要一个 embedding API key 才能工作。OpenClaw 支持 OpenAI、Gemini、Voyage、Mistral 的 embedding。你有哪个的 key？配上之后我就能通过语义搜索找到历史对话和笔记了。

用户配好后再跑一次确认。

---

## 完成

全部检查通过后，告诉用户当前状态：

> Memory Deposit 配置完整。6 层记忆系统已就绪：
> - ✅ 对话上下文（出厂自带）
> - ✅ 每日笔记（出厂自带）
> - ✅ 长期记忆（出厂自带）
> - ✅ 完整对话合并（transcripts/）
> - ✅ 向量召回
> - ✅ Git 版本管理

## 与其他 ClaWise 模块的关系

- **noise-reduction**：对话合并降噪的进阶策略
- **retrieval-enhance**：向量召回的高级用法（query expansion、reranking）
- **save-game / load-game**：依赖 `memory/projects/`
- **project-skill-pairing**：依赖本 skill 的目录结构
