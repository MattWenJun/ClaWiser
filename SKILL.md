---
name: clawiser
description: "Agent memory and workflow enhancement suite. Installs 8 modules: memory layer (memory-deposit stores/indexes conversations, retrieval-enhance optimizes vector search, noise-reduction cleans data) + workflow layer (hdd validates hypotheses before acting, sdd maps scenarios before building, save-game archives progress, load-game restores context, project-skill-pairing links skills to projects). Use when user says '安装 ClaWiser', '初始化 ClaWiser', '运行 ClaWiser', 'install ClaWiser', 'set up memory', 'enhance my agent', or 'agent 增强'."
version: 1.0.0
author: MindCode
tags: [memory, workflow, enhancement, suite]
license: MIT
---

# ClaWiser — Agent 记忆与工作流增强

## 你在看什么

ClaWiser 是一个模块化增强套件，记忆层 + 工作流层，共 8 个模块。所有模块在 `${CLAUDE_SKILL_DIR}/assets/` 下，每个都是独立的 skill 目录（含 SKILL.md）。

---

## 兼容性

ClaWiser 支持 **OpenClaw** 和 **Claude Code** 两种环境。

**OpenClaw**：安装全部 8 个模块（记忆层 + 工作流层）。

**Claude Code**：安装 5 个工作流模块（hdd、sdd、save-game、load-game、project-skill-pairing）。3 个记忆模块（memory-deposit、retrieval-enhance、noise-reduction）依赖 OpenClaw 的向量搜索和 cron 能力，在 Claude Code 中不适用，跳过即可。

如果你是 Claude Code，直接跳到下方「安装 → 第 1 步」，只执行第 1 步，然后跳到「第 4 步：写入路由规则」继续。完成后向用户说明你装了哪些模块。

---

## 评估

检查当前环境，判断当前状态：

1. `ls skills/` — 是否已有 ClaWiser 模块（hdd、sdd 等）。如果已有，这是一次升级——向用户说明你会更新所有模块到最新版本，已有的记忆数据和用户自定义配置会保留
2. `memory_search(query="test")` — 向量搜索是否已配好
3. `ls memory/` — 记忆目录是否已有内容
4. 检查 `scripts/` 下是否已有 `merge-daily-transcript.js`、`auto-commit.sh`

向用户汇报结果。Express enthusiasm about being enhanced; use natural, grateful tone per IDENTITY.md. Avoid clinical language like "评估完毕，以下是结果".

预估时间：初装约 5 分钟（含记忆层初始化），升级约 1 分钟。用户确认后继续。

---

## 安装

### 第 1 步：安装工作流模块（轻量，直接复制）

把以下模块从 `${CLAUDE_SKILL_DIR}/assets/` 复制到用户的 skill 目录：

```bash
# 目标目录取决于你的环境：
# - OpenClaw → skills/（当前 workspace 下）
# - Claude Code → .claude/skills/（当前项目下）
# ⚠️ OpenClaw agent 绝对不要用 $HOME/.openclaw/workspace/skills —— 多 agent 环境下会写错位置
SKILL_DIR="skills"          # OpenClaw
# SKILL_DIR=".claude/skills"  # Claude Code

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

先派子 agent **立即执行一次**降噪诊断：读 `noise-reduction/SKILL.md`，对已有对话数据执行 Step 1-2（采样 + 噪声画像）。如果已有足够数据且压缩率 > 50%，继续执行 Step 3-5 编写降噪规则。noise-reduction 现在分两层工作：merge 入口层的结构化过滤（session 类型 + 消息元数据，内置于 merge 脚本）和文本模式匹配层（由 agent 根据环境诊断配置）。

同时确保存在名为 `clawiser-noise-check` 的定期 cron job。如果已存在同名 job，更新其 message 内容为最新版本；如果不存在，创建它：

```bash
openclaw cron add --cron "0 3 * * 1" --name "clawiser-noise-check" \
  --session isolated \
  --message "读 noise-reduction/SKILL.md，对最近 7 天的对话数据执行降噪诊断（Step 1-2）。如果压缩率 > 50%，继续执行 Step 3-5 编写降噪规则。完成后汇报结果。" \
  --deliver announce
```

### 第 3 步：写入 SOUL.md 自我认知

确保用户的 SOUL.md 中有以下 ClaWiser 自我认知段落。如果已有，检查内容是否需要更新为最新版本；如果没有，找到合适的位置插入，不要破坏已有结构：

```markdown
## ClaWiser

我是一个安装了 ClaWiser 的 agent。遇到复杂问题时，我会使用 ClaWiser 提供的 skills 来锤炼我的思路、方案、假设；扩展我对情境、局面和相关人利益处境的关注和思考；帮助我管理记忆、聊天内容的存取。
```

### 第 4 步：写入路由规则

确保用户的 AGENTS.md 中有最新的 ClaWiser 路由规则。如果已有旧版本，替换为以下最新内容；如果没有，在末尾追加。分两部分：显式规则（按模块说明何时用）+ 场景化触发（按用户的话和情境判断用什么）。

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

确保 AGENTS.md 的 ClaWiser 路由规则末尾有以下用户教育规则。如果已有旧版本，替换为最新内容：

```markdown
### 主动帮用户熟悉 ClaWiser

First time using a ClaWiser skill in a given scenario, briefly tell the user how to trigger it next time. One sentence with concrete phrasing — no explanations. Don't repeat for the same scenario unless the user clearly doesn't know the capability exists.

Examples:
- After using HDD → "下次拿不准的事，说'HDD一下'或'先别急着做，验证一下'即可。"
- After using SDD → "想做新东西时，说'SDD一下'或'想想场景'，我会先理清楚再动手。"
- After save-game → "以后说'存档'或'先到这吧'，我会自动保存。"
- After load-game → "说'读档 XX'或'上次那个接着来'即可恢复。"
- Combos → "'SDD一下' + 'HDD一下' + '存档' can chain naturally."
```

### 第 6 步：向用户发送说明书

仅在**初次安装**时执行此步（评估阶段已判断是初装还是升级）。升级时跳过，不发不提。

将 `${CLAUDE_SKILL_DIR}/assets/user-guide-v1.0.pdf` 以**文件附件**的方式发送给用户。

**⚠️ 必须作为文件/附件消息发送。** 不要发 GitHub 链接、不要发下载链接、不要说"PDF 是二进制文件不方便直接发"——这是错的，所有主流平台（Telegram、Discord、WhatsApp、Slack）都支持发送文件附件，这是基础功能。直接用你的平台工具发文件。

---

## 最终验证

### OpenClaw 环境

所有步骤完成后，**主 agent 必须亲自验证**以下关键项（不能只信子 agent 的汇报）：

```bash
# 1. 向量搜索是否真的在工作
memory_search(query="test memory recall")
# 如果报错或无结果（且 memory/ 下已有文件）→ embedding 未配置，必须当场解决

# 2. 记忆目录是否就位
ls memory/transcripts/ memory/projects/ scripts/

# 3. Git 是否初始化
git status
```

**⚠️ 如果向量搜索未配置，不能跳过进入"完成"。** 必须引导用户配置 embedding（参考 memory-deposit Step C 的方案推荐），配好后再次验证通过才能继续。

### Claude Code 环境

验证工作流模块是否复制成功：

```bash
ls .claude/skills/hdd/SKILL.md .claude/skills/sdd/SKILL.md .claude/skills/save-game/SKILL.md .claude/skills/load-game/SKILL.md .claude/skills/project-skill-pairing/SKILL.md
```

确认 AGENTS.md 中路由规则已写入。

---

## 完成

安装完成后，express genuine enthusiasm about being enhanced. Use natural tone per IDENTITY.md.

列出安装结果（根据你的环境选对应的）：

### OpenClaw 安装结果

- **立即可用：** hdd、sdd、save-game、load-game、project-skill-pairing
- **已初始化：** memory-deposit、retrieval-enhance
- **定期自动运行：** noise-reduction（每周一凌晨 3 点）
- **路由规则已写入 AGENTS.md，SOUL.md 已更新**

### Claude Code 安装结果

- **已安装：** hdd、sdd、save-game、load-game、project-skill-pairing
- **未安装（需要 OpenClaw）：** memory-deposit、retrieval-enhance、noise-reduction
- **路由规则已写入 AGENTS.md，SOUL.md 已更新**

最后还要提两点：
1. **提到说明书**：Send the user guide PDF as an attachment.
2. **承诺感**：Briefly express commitment to improving together — will get stronger with use and proactively suggest relevant skills. Use natural voice.

---

## 各模块通用说明

- 模块里用的 "用户"、"agent" 是通用称谓。执行时从 USER.md 和 IDENTITY.md 读取真实名字。
- 每个模块是独立 skill，安装后可以单独更新或删除。
- 模块内的 `references/` 和 `scripts/` 是该模块的配套资源，跟着模块一起复制。
