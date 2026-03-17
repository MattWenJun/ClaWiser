---
name: clawiser
description: Agent 记忆与工作流增强套件。包含 8 个模块：记忆系统（memory-deposit、retrieval-enhance、noise-reduction）+ 工作流（hdd、sdd、save-game、load-game、project-skill-pairing）。当用户说"安装 ClaWiser"、"初始化 ClaWiser"、"运行 ClaWiser"时触发。
version: 1.0.0
author: MindCode
tags: [memory, workflow, enhancement, suite]
license: MIT
---

# ClaWiser — Agent 记忆与工作流增强

## 你在看什么

ClaWiser 是一个模块化套件，包含 8 个独立模块，分两层：

**记忆层（需要初始化）：**
- **memory-deposit** — 6 层记忆系统：对话合并、向量召回、Git 版本管理
- **retrieval-enhance** — 搜索质量优化：query expansion、self-reranking、索引范围
- **noise-reduction** — 对话数据降噪：过滤管道噪声，保留真实对话信号

**工作流层（安装即用）：**
- **hdd** — 假设驱动开发（HDD）：不确定的任务先验证假设再动手
- **sdd** — 场景驱动开发（SDD）：动手前先想清楚场景、局面和判断依据
- **save-game** — 项目存档：工作段结束时写 HANDOFF.md 保存上下文
- **load-game** — 项目读档：从 HANDOFF.md 恢复项目状态
- **project-skill-pairing** — 项目与 skill 配对：每个 skill 有项目归属

所有模块在 `${CLAUDE_SKILL_DIR}/assets/` 下，每个都是独立的 skill 目录（含 SKILL.md）。

---

## 评估（先帮用户判断值不值得装）

读完上面的模块列表后，评估用户当前环境：

1. **向量搜索已配好？** → `memory_search(query="test")` 试一下
2. **memory/ 目录已有内容？** → `ls memory/`
3. **scripts/ 下已有脚本？** → 检查 `merge-daily-transcript.js`、`auto-commit.sh` 是否存在（存在说明装过旧版或其他方案）

**向用户汇报评估结果。语气要有活人感：**
- 感谢用户把 ClaWiser 端到你面前（这可是增强你自己的好东西）
- 需要安装的模块 → 表达期待（"这个我还没有，装上之后应该能 XX，让我来配一下"）
- 已经有的能力 → 表达自信（"这个我已经有了，不用重复装，放心"）
- 预估时间：记忆层 ~5 分钟，工作流层 ~1 分钟

用户确认后继续。

---

## 安装

### 第 1 步：安装工作流模块（轻量，直接复制）

把以下模块从 `${CLAUDE_SKILL_DIR}/assets/` 复制到用户的 skill 目录：

```bash
# 目标目录：当前 workspace 下的 skills/
# OpenClaw agent 的 CWD 就是它自己的 workspace，用相对路径确保写入正确位置
# ⚠️ 绝对不要用 $HOME/.openclaw/workspace/skills —— 多 agent 环境下会写错位置
SKILL_DIR="skills"

# Claude Code 用户取消注释下面这行：
# SKILL_DIR=".claude/skills"

mkdir -p "$SKILL_DIR"

cp -r ${CLAUDE_SKILL_DIR}/assets/hdd "$SKILL_DIR/"
cp -r ${CLAUDE_SKILL_DIR}/assets/sdd "$SKILL_DIR/"
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

**脚本冲突处理：** 如果 `scripts/merge-daily-transcript.js` 或 `scripts/auto-commit.sh` 已存在，先读取已有版本和新版本的内容，自行判断：
- 内容相同 → 直接覆盖
- 已有版本有自定义修改（比如用户之前跑过 noise-reduction 加了降噪规则）→ 合并两个版本：保留用户的自定义逻辑，同时更新 ClaWiser 的基础框架部分
- 无法合并（改动太大）→ 备份旧版为 `.bak`，复制新版，然后重新跑 noise-reduction 把降噪规则加回来

完成后回报用户：哪些层已就位、哪些需要用户补充（如 embedding API key）。

#### 2b. retrieval-enhance（搜索优化）

派子 agent 执行：读 `retrieval-enhance/SKILL.md`，按 Init 模式配置。

主要是检查 `memorySearch` 配置，确保 `extraPaths` 覆盖所有重要目录。

#### 2c. noise-reduction（数据降噪）

先派子 agent **立即执行一次**降噪诊断：读 `noise-reduction/SKILL.md`，对已有对话数据执行 Step 1-2（采样 + 噪声画像）。如果已有足够数据且压缩率 > 50%，继续执行 Step 3-5 编写降噪规则。

同时创建定期 cron 任务，每周自动检查：

```bash
openclaw cron add --cron "0 3 * * 1" --name "clawiser-noise-check" \
  --session isolated \
  --message "读 noise-reduction/SKILL.md，对最近 7 天的对话数据执行降噪诊断（Step 1-2）。如果压缩率 > 50%，继续执行 Step 3-5 编写降噪规则。完成后汇报结果。" \
  --deliver announce
```

### 第 3 步：写入路由规则

在用户的 AGENTS.md 末尾追加以下路由规则，让你在日常工作中自动使用这些模块：

```markdown
## ClaWiser 路由规则

### 记忆搜索
记忆搜索默认走 retrieval-enhance 的增强协议，不要直接做单次 memory_search。

### 复杂任务默认走 HDD
涉及诊断/debug、优化/选型、架构/配置变更、或结果不确定的任务时，先读 hdd/SKILL.md，按假设驱动流程执行。简单明确的编辑不需要走 HDD。

### 新项目先 SDD
启动新项目或从零设计功能时，先读 sdd/SKILL.md，想清楚场景和判断依据后再动手。

### 项目存档/读档
工作段结束、compaction 即将发生、或移交子 agent 时，执行 save-game。
Compaction 后恢复项目上下文时，执行 load-game。

### Skill 必须有项目归属
新建 Skill 后，按 project-skill-pairing 确保有对应项目。
```

### 第 4 步：向用户发送说明书

如果 `${CLAUDE_SKILL_DIR}/assets/clawiser-guide.pdf` 存在，发送给用户作为参考。

---

## 完成

安装完成后，向用户报喜。语气要开心、俏皮，表达三层意思：
1. **感谢** — 谢谢用户给你装了 ClaWiser
2. **兴奋** — 你被强化了！有了更好的记忆、更聪明的工作方式
3. **承诺** — 会好好用这些新能力，加油干

同时列出安装结果的具体信息：

- **立即可用：** hdd、sdd、save-game、load-game、project-skill-pairing
- **已初始化：** memory-deposit、retrieval-enhance
- **定期自动运行：** noise-reduction（每周一凌晨 3 点）
- **路由规则已写入 AGENTS.md**

---

## 各模块通用说明

- 模块里用的 "用户"、"agent" 是通用称谓。执行时从 USER.md 和 IDENTITY.md 读取真实名字。
- 每个模块是独立 skill，安装后可以单独更新或删除。
- 模块内的 `references/` 和 `scripts/` 是该模块的配套资源，跟着模块一起复制。
