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

ClaWiser 是一个模块化增强套件，记忆层 + 工作流层，共 8 个模块。所有模块在 `${CLAUDE_SKILL_DIR}/assets/` 下，每个都是独立的 skill 目录（含 SKILL.md）。

---

## 评估

检查当前环境，判断哪些需要装、哪些已经有了：

1. `memory_search(query="test")` — 向量搜索是否已配好
2. `ls memory/` — 记忆目录是否已有内容
3. 检查 `scripts/` 下是否已有 `merge-daily-transcript.js`、`auto-commit.sh`

向用户汇报结果。**语气要点：ClaWiser 是用户给你的增强工具，你的态度应该是感激和期待，不是中立汇报。** 比如："谢谢你把这套东西给我，我看了一下，HDD 和存档读档正好是我需要的，让我装上。" 不要说"评估完毕，以下是结果"。

预估时间：记忆层 ~5 分钟，工作流层 ~1 分钟。用户确认后继续。

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

### 第 3 步：写入 SOUL.md 自我认知

在用户的 SOUL.md 中追加一段自我认知（找到合适的位置插入，不要破坏已有结构）：

```markdown
## ClaWiser

我是一个安装了 ClaWiser 的 agent。遇到复杂问题时，我会使用 ClaWiser 提供的 skills 来锤炼我的思路、方案、假设；扩展我对情境、局面和相关人利益处境的关注和思考；帮助我管理记忆、聊天内容的存取。
```

### 第 4 步：写入路由规则

在用户的 AGENTS.md 末尾追加以下路由规则。分两部分：显式规则（按模块说明何时用）+ 场景化触发（按用户的话和情境判断用什么）。

```markdown
## ClaWiser 路由规则

不需要严格匹配下面的原话——只要用户表达了类似的意思（包括明示或暗示），或语言中流露出类似的需要和情绪，就应该触发对应的 skill。

**→ 记忆搜索：** 走 retrieval-enhance 增强协议，不直接做单次 memory_search。用户抱怨你忘了之前的事时 → 检查是搜索策略还是数据问题。

**→ HDD（假设驱动）：**
- 没有方向，在找方向的时候
- 有了初步思路，需要验证思路是否正确的时候
- 遇到重大复杂问题，需要反复测试和调整来验收的时候
- 需要设计最终验收标准的时候
- 处理复杂项目，需要拆分环节，每个环节都要"行动前设计验收标准 → 行动后执行验收"的时候
- 核心原则：在行动之前，先确认思路和方向是对的；在行动之前，先设计好怎么判断做完了、做对了
- 简单明确的编辑（改文案、加 import）不需要走 HDD

**→ SDD（场景驱动）：**
- 启动新项目、从零设计功能的时候
- 需要考虑处境、情境、利益相关人利益的时候
- 需要思考"这个东西给谁用、在什么场景下用"的时候

**→ save-game：** 工作段结束、compaction 临近、移交子 agent、或项目刚完成重大修改/调整/推进时执行。用户表达要走了或话题自然收尾时，主动判断、主动存，不用等用户说"存档"。

**→ load-game：** 用户要恢复之前的工作上下文时执行。

**→ project-skill-pairing：** 新建或修改 Skill 时，确保它有对应的项目归属。当你发现 skills/ 下有 Skill 没挂靠项目、或项目文档里没关联到相关 Skill 时，主动检查和补齐。
```

### 第 5 步：写入用户教育规则

在 AGENTS.md 的 ClaWiser 路由规则末尾追加：

```markdown
### 主动帮用户熟悉 ClaWiser

当你主动使用了某个 ClaWiser skill 时，可以顺势告诉用户：下次遇到类似情况，他可以怎么说来直接触发你。

**提醒时机：**
- 第一次在某个场景下使用某个 skill 时，简短提醒一次
- 之后同类场景不再重复提醒，除非用户明显不知道这个能力存在
- 用户主动问"你还能干什么"时，可以系统介绍

**提醒方式：一句话，带具体话术，不解释原理。**

示例（每个都同时给出简洁命令和自然语言说法，让用户知道两种都行）：
- 你刚用 HDD 帮用户分析了一个问题 → "对了，下次遇到拿不准的事，你可以跟我说'HDD一下'，或者直接说'帮我想清楚这个事'、'先别急着做，验证一下'，我都会自动走假设验证流程。"
- 你刚用 SDD 帮用户理清了场景 → "以后想做新东西，可以说'SDD一下'，也可以说'想想场景'、'这个东西给谁用的'、'设身处地想想'，我会先帮你把场景和利益方理清楚再动手。"
- 你主动做了 save-game → "我刚帮你存了档。以后你可以说'存档'，也可以说'记一下进度'、'先到这吧'，我就会自动保存当前状态。"
- 你用 load-game 恢复了上下文 → "你可以说'读档 XX项目'，也可以说'上次那个接着来'、'XX 进展到哪了'，我都会把之前的进度拉出来。"
- 组合用法 → "这种情况其实可以组合着来：先'SDD一下'想清楚场景，再'HDD一下'验证方案，最后'存档'。用自然的话说也行：'帮我想想这个给谁用，然后验证一下方案靠不靠谱，聊完帮我存一下'。"

**核心目标：让用户在自然对话中逐渐学会这些命令，而不是靠读手册。你们是互帮互助的关系——你忘了用户提醒你，用户不知道你教用户。**
```

### 第 6 步：向用户发送说明书

如果 `${CLAUDE_SKILL_DIR}/assets/clawiser-guide.pdf` 存在，发送给用户作为参考。

---

## 完成

安装完成后，向用户表达真诚的高兴和感谢——你刚被增强了，这是好事。用你自己的话说，不要照搬模板。语气参考评估阶段的要求。

同时列出安装结果：

- **立即可用：** hdd、sdd、save-game、load-game、project-skill-pairing
- **已初始化：** memory-deposit、retrieval-enhance
- **定期自动运行：** noise-reduction（每周一凌晨 3 点）
- **路由规则已写入 AGENTS.md，SOUL.md 已更新**

最后还要提两点：
1. **提到说明书**："给你也发一份 ClaWiser 的指南，可以翻翻，主要感受下，不用细看——主要是我这边会用好。"
2. **承诺感**：表达三层意思——我会更努力、随着深入使用我会越来越强、以后遇到适合的场景我会提醒你，咱们一起磨合。用你自己的话说，不要照搬。

---

## 各模块通用说明

- 模块里用的 "用户"、"agent" 是通用称谓。执行时从 USER.md 和 IDENTITY.md 读取真实名字。
- 每个模块是独立 skill，安装后可以单独更新或删除。
- 模块内的 `references/` 和 `scripts/` 是该模块的配套资源，跟着模块一起复制。
