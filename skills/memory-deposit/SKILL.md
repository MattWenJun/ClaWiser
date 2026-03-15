---
name: memory-deposit
description: 搭建完整的 6 层记忆系统。OpenClaw 出厂自带前 3 层，本 skill 补齐第 4 层（完整对话合并）、确保第 5 层（向量召回）生效、搭建第 6 层（Git 版本管理），并建立标准目录约定。安装后 agent 能真正记住细节、恢复上下文、回溯历史。
version: 0.1.0
author: Matt (MindCode)
tags: [memory, foundation, clawise]
requires: []
layer: foundation
---

# Memory Deposit — 记忆沉淀

出厂有 3 层记忆（对话上下文、每日笔记、长期记忆），本 skill 补齐第 4、5、6 层。按顺序执行以下 6 步。

## Step 1: 建目录 + 安装脚本

```bash
mkdir -p memory/transcripts memory/projects memory/voice scripts
```

从本 skill 的 `scripts/` 目录复制以下文件到 workspace 的 `scripts/`：
- `merge-daily-transcript.js` — 对话合并
- `auto-commit.sh` — Git 自动提交

验证：`ls scripts/merge-daily-transcript.js scripts/auto-commit.sh` 都存在。

## Step 2: Git 初始化

如果 workspace 没有 `.git/`：

```bash
cd ~/.openclaw/workspace
git init
```

写入 `.gitignore`（排除 tmp/、.env*、*.secrets、node_modules/、.DS_Store）。

执行首次提交：
```bash
git add -A && git commit -m "init: workspace under version control"
```

验证：`git log` 有 commit。

## Step 3: 配置 Heartbeat

在 HEARTBEAT.md 里追加：

```markdown
# 对话合并
运行 node scripts/merge-daily-transcript.js $(date +%Y-%m-%d)

# Git 自动提交
运行 bash scripts/auto-commit.sh
```

验证：HEARTBEAT.md 包含这两行。

## Step 4: 确保向量召回生效

执行 `memory_search(query="测试")`。

- **有结果** → 跳过。
- **无结果或报错** → 告诉用户：

> 记忆系统搭好了，但向量搜索需要一个 embedding API key 才能工作。你有 OpenAI、Gemini 或 Voyage 的 key 吗？配上之后我就能通过语义搜索找到历史对话和笔记了。

用户配好后再跑一次确认。

## Step 5: 写入记忆规则

在 AGENTS.md 里追加：

```markdown
## 记忆规则

### 每日笔记（memory/YYYY-MM-DD.md）
记录：
- 所有决策及其理由（为什么选 A 不选 B）
- 关键分歧和最终结论
- 踩过的坑和教训
- 重要的数字、时间节点、外部信息

不记录：
- 临时状态、已完成的琐碎待办、工具调用中间输出

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

写入后告诉用户：已经把记忆规则写进了 AGENTS.md，后续你可以根据自己的需要继续调整。

## Step 6: 自检

- [ ] `memory/transcripts/` 存在
- [ ] `memory/projects/` 存在
- [ ] 两个脚本在 `scripts/` 下
- [ ] HEARTBEAT.md 有 merge 和 auto-commit
- [ ] `memory_search` 能返回结果
- [ ] `git log` 有 commit
- [ ] AGENTS.md 有记忆规则

全部通过 → 告诉用户安装完成。

## 与其他 ClaWise 模块的关系

- **noise-reduction**：对话合并降噪的进阶策略
- **retrieval-enhance**：向量召回的高级用法（query expansion、reranking）
- **save-game / load-game**：依赖 `memory/projects/`
- **project-skill-pairing**：依赖本 skill 的目录结构
