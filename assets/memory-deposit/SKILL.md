---
name: memory-deposit
description: 检查并补齐 6 层记忆系统。检查当前 workspace 的记忆配置是否完整，缺什么补什么。已完成则报告状态，未完成则引导配置。可反复执行。
version: 0.3.0
author: MindCode
tags: [memory, foundation, clawiser]
---

# Memory Deposit — 记忆沉淀

出厂有 3 层记忆（对话上下文、每日笔记、长期记忆），本 skill 补齐第 4、5、6 层。

## 快速检查

先跑一遍，判断是否需要安装：

1. `memory/transcripts/` 存在？
2. `memory/projects/` 存在？
3. `scripts/merge-daily-transcript.js` 存在？
4. `scripts/auto-commit.sh` 存在？
5. `.git/` 存在？
6. HEARTBEAT.md 包含 `merge-daily-transcript` 和 `auto-commit`？
7. AGENTS.md 包含 `## 记忆规则`？
8. `memory_search(query="test memory recall")` 有结果？（如果 memory/ 下有文件的话）

**全部通过** → 跳到「完成」报告状态。
**任一未通过** → 按下面的步骤补齐。

---

## 步骤 A：文件就位

### A1. 目录

```bash
mkdir -p memory/transcripts memory/projects memory/voice scripts
```

### A2. 脚本

从本 skill 的 `scripts/` 目录复制到 workspace 的 `scripts/`：
- `merge-daily-transcript.js` → 对话合并
- `auto-commit.sh` → Git 自动提交

验证：两个文件都在 `scripts/` 下。

### A3. Voice JSONL 格式约定

如果你会保存语音对话到 `memory/voice/YYYY-MM-DD.jsonl`，每条记录必须包含 `role` 字段：

```json
{"ts":"2026-03-15T20:00","role":"user","text":"语音转写内容"}
{"ts":"2026-03-15T20:01","role":"assistant","text":"TTS回复内容"}
```

`role` 用 `"user"` 或 `"assistant"`，不要用实际名字。merge 脚本依赖这个字段区分发话人。

### A4. ⚠️ 合并输出的名字

merge 脚本生成的 transcript 里，发话人标识默认是 `👤 用户` 和 `🤖 Agent`。**执行合并时，读取 USER.md 和 IDENTITY.md，用真实名字替换通用称谓。** 例如：用户叫 Jack、agent 叫 Alice → 输出 `👤 Jack` 和 `🤖 Alice`。

### A5. ⚠️ 索引范围

确保所有重要目录纳入向量索引。OpenClaw 的 `memorySearch.extraPaths` 支持多个目录：

```json5
memorySearch: {
  extraPaths: ["data/transcripts", "AGENTS.md", "TOOLS.md"]
}
```

**不要只索引 memory/**——如果有其他包含重要内容的目录（项目文档、转写存档、参考资料），都应加入 `extraPaths`。用 `gateway(action=config.patch)` 修改。

---

## 步骤 B：配置

### B1. Git

检查 `.git/` 是否存在。

不存在 →
```bash
cd ~/.openclaw/workspace && git init
```
写入 `.gitignore`（排除 tmp/、.env*、*.secrets、node_modules/、.DS_Store），执行首次提交。

已存在 → 检查 `.gitignore` 包含上述排除项，缺的补上。

### B2. Heartbeat

检查 HEARTBEAT.md 是否包含对话合并和自动提交。缺的追加：

```markdown
# 对话合并
运行 node scripts/merge-daily-transcript.js $(date +%Y-%m-%d)

# Git 自动提交
运行 bash scripts/auto-commit.sh
```

### B3. 记忆规则

检查 AGENTS.md 是否包含 `## 记忆规则`。

不存在 → 读取 `references/memory-rules.md`，追加到 AGENTS.md 末尾。写入后告诉用户：已把记忆规则写进 AGENTS.md，后续可以根据需要调整。

---

## 步骤 C：验证向量召回

执行 `memory_search(query="记忆")`。

- **有结果** → 向量召回在工作。
- **无结果或报错** → 可能是 embedding key 未配置，也可能是 memory 目录下还没有足够内容。

区分方法：检查 memory/ 下是否有 .md 文件。
- **有文件但搜不到** → embedding key 未配置。告诉用户：

> 向量搜索需要一个 embedding API key。OpenClaw 支持 OpenAI、Gemini、Voyage、Mistral 的 embedding，配好任意一个就行。你有哪个的 key？

用户配好后再跑一次确认。

- **没有文件** → 正常，还没有数据。告诉用户：向量搜索已就绪，等你用几天积累了笔记后就能搜到了。

---

## 完成

报告当前状态（根据实际检查结果标注）：

> Memory Deposit 检查完成：
> - ✅/⚠️ 对话上下文（出厂自带）
> - ✅/⚠️ 每日笔记（出厂自带）
> - ✅/⚠️ 长期记忆（出厂自带）
> - ✅/⚠️ 完整对话合并（transcripts/）
> - ✅/⚠️ 向量召回
> - ✅/⚠️ Git 版本管理

未通过的项标 ⚠️ 并说明原因。

## 与其他 ClaWiser 模块的关系

- **noise-reduction** → 对话合并降噪的进阶策略
- **retrieval-enhance** → 向量召回的高级用法（query expansion、reranking）
- **save-game / load-game** → 依赖 `memory/projects/`
- **project-skill-pairing** → 依赖本 skill 的目录结构

## 故障排查

如果 6 层记忆都就位但召回质量仍然差：
- transcript 里噪声太多 → 跑 `noise-reduction` 诊断降噪规则
- 搜索命中不准 → 跑 `retrieval-enhance` 优化检索策略
