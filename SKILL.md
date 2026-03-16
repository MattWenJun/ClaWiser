---
name: clawise
description: Agent 记忆与工作流增强套件。包含 8 个模块：记忆系统（memory-deposit、retrieval-enhance、noise-reduction）+ 工作流（hdd、product-first、save-game、load-game、project-skill-pairing）。当用户说"安装 ClaWise"、"初始化 ClaWise"、"运行 ClaWise"时触发。
version: 1.0.0
author: MindCode
tags: [memory, workflow, enhancement, suite]
license: MIT
---

# ClaWise — Agent 记忆与工作流增强

## 你在看什么

ClaWise 是一个模块化套件，包含 8 个独立模块，分两层：

**记忆层（需要初始化）：**
- **memory-deposit** — 6 层记忆系统：对话合并、向量召回、Git 版本管理
- **retrieval-enhance** — 搜索质量优化：query expansion、self-reranking、索引范围
- **noise-reduction** — 对话数据清洗：过滤管道噪声，保留真实对话信号

**工作流层（安装即用）：**
- **hdd** — 假设驱动开发（HDD）：不确定的任务先验证假设再动手
- **product-first** — 产品先行（PF）：做技术方案前先定义产品目标
- **save-game** — 项目存档：工作段结束时写 HANDOFF.md 保存上下文
- **load-game** — 项目读档：从 HANDOFF.md 恢复项目状态
- **project-skill-pairing** — 项目与 skill 配对：每个 skill 有项目归属

所有模块在 `${CLAUDE_SKILL_DIR}/assets/` 下，每个都是独立的 skill 目录（含 SKILL.md）。

---

## 评估（先帮用户判断值不值得装）

读完上面的模块列表后，评估用户当前环境：

1. **向量搜索已配好？** → `memory_search(query="test")` 试一下
2. **memory/ 目录已有内容？** → `ls memory/`
3. **已有 daily notes 习惯？** → 检查 `memory/YYYY-MM-DD.md` 是否存在

**告诉用户：**
- 推荐装哪些模块、为什么
- 不需要装的（比如向量搜索已配好 → memory-deposit 的向量部分可跳过）
- 预估时间：记忆层 ~5 分钟，工作流层 ~1 分钟

用户确认后继续。

---

## 安装

### 第 1 步：安装工作流模块（轻量，直接复制）

把以下模块从 `${CLAUDE_SKILL_DIR}/assets/` 复制到用户的 skill 目录：

```bash
# 目标目录（根据平台调整）
SKILL_DIR="$HOME/.openclaw/workspace/skills"  # OpenClaw
# SKILL_DIR=".claude/skills"                   # Claude Code

cp -r ${CLAUDE_SKILL_DIR}/assets/hdd "$SKILL_DIR/"
cp -r ${CLAUDE_SKILL_DIR}/assets/product-first "$SKILL_DIR/"
cp -r ${CLAUDE_SKILL_DIR}/assets/save-game "$SKILL_DIR/"
cp -r ${CLAUDE_SKILL_DIR}/assets/load-game "$SKILL_DIR/"
cp -r ${CLAUDE_SKILL_DIR}/assets/project-skill-pairing "$SKILL_DIR/"
```

这 5 个模块复制完就能用，不需要初始化。

### 第 2 步：安装记忆模块（需要初始化，派子 agent）

```bash
cp -r ${CLAUDE_SKILL_DIR}/assets/memory-deposit "$SKILL_DIR/"
cp -r ${CLAUDE_SKILL_DIR}/assets/retrieval-enhance "$SKILL_DIR/"
cp -r ${CLAUDE_SKILL_DIR}/assets/noise-reduction "$SKILL_DIR/"
```

复制完后，**按顺序初始化**（每个都派子 agent 执行，避免阻塞主对话）：

#### 2a. memory-deposit（基础，必须先做）

派子 agent 执行：读 `memory-deposit/SKILL.md`，按其中的步骤完成 6 层记忆配置。

完成后回报用户：哪些层已就位、哪些需要用户补充（如 embedding API key）。

#### 2b. retrieval-enhance（搜索优化）

派子 agent 执行：读 `retrieval-enhance/SKILL.md`，按 Init 模式配置。

主要是检查 `memorySearch` 配置，确保 `extraPaths` 覆盖所有重要目录。

#### 2c. noise-reduction（数据清洗）

**这个不立即执行。** 创建一个定期 cron 任务：

```bash
# 每周跑一次降噪诊断
openclaw cron add --cron "0 3 * * 1" --name "clawise-noise-check" \
  --session isolated \
  --message "读 noise-reduction/SKILL.md，对最近 7 天的对话数据执行降噪诊断（Step 1-2）。如果发现压缩率 > 50%，继续执行 Step 3-5 编写降噪规则。完成后汇报结果。" \
  --deliver announce
```

告诉用户：降噪模块已设为每周自动检查。积累了一周对话数据后会自动开始优化。

### 第 3 步：注入路由规则

在用户的 AGENTS.md 末尾追加以下路由规则：

```markdown
## ClaWise 路由规则

### 记忆搜索
记忆搜索默认走 retrieval-enhance 的增强协议，不要直接做单次 memory_search。

### 复杂任务默认走 HDD
涉及诊断/debug、优化/选型、架构/配置变更、或结果不确定的任务时，先读 hdd/SKILL.md，按假设驱动流程执行。简单明确的编辑不需要走 HDD。

### 新项目先 PF
启动新项目或从零设计功能时，先读 product-first/SKILL.md，定义产品目标和用户场景后再做技术方案。

### 项目存档/读档
工作段结束、compaction 即将发生、或移交子 agent 时，执行 save-game。
Compaction 后恢复项目上下文时，执行 load-game。

### Skill 必须有项目归属
新建 Skill 后，按 project-skill-pairing 确保有对应项目。
```

### 第 4 步：向用户发送说明书

如果 `${CLAUDE_SKILL_DIR}/assets/clawise-guide.pdf` 存在，发送给用户作为参考。

---

## 完成

安装完成后，告诉用户：

> ClaWise 安装完成 ✅
>
> **立即可用：** hdd（`/hdd`）、product-first（`/pf`）、save-game、load-game、project-skill-pairing
> **已初始化：** memory-deposit、retrieval-enhance
> **定期自动运行：** noise-reduction（每周一凌晨 3 点）
>
> 路由规则已写入 AGENTS.md。你的 agent 会在合适的场景自动使用这些模块。

---

## 各模块通用说明

- 模块里用的 "用户"、"agent" 是通用称谓。执行时从 USER.md 和 IDENTITY.md 读取真实名字。
- 每个模块是独立 skill，安装后可以单独更新或删除。
- 模块内的 `references/` 和 `scripts/` 是该模块的配套资源，跟着模块一起复制。
