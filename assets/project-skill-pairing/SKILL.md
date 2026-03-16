---
name: project-skill-pairing
description: 项目与 Skill 的双向绑定。新建 Skill 时挂靠项目，新建项目时关联 Skill。触发词："建个项目"、"初始化项目"、"新建 skill"、"project init"、"查缺补漏"、"项目结构"。也在创建或修改 Skill 后自动检查项目归属。
version: 0.1.0
author: MindCode
tags: [project-management, skill-management, clawiser]
---

# Project-Skill Pairing — 项目与 Skill 结对

**每个 Skill 必须有项目归属。每个项目必须知道自己关联哪些 Skill。**

Skill 不是孤零零的 prompt 文件。它从项目中长出来，在项目中演化，它为什么长成这样、改过几次、在哪验证过，都要有地方可追。

## 核心规则

### Skill → 项目（Skill 必须有归属）

新建 Skill 后，二选一：

1. **独立 Skill**（通用工具，如 hdd、save-game）
   → 建同名 project：`memory/projects/<skill-name>/HANDOFF.md`

2. **项目衍生 Skill**（从某个项目中长出来的）
   → 在该项目目录下建 symlink 指向 skill

### 项目 → Skill（项目要知道自己的 Skill）

**只链接直接关联的 skill，不链接通用工具。**

判断标准：**如果这个 skill 不存在，这个项目就无法正常运行或理解** → 链接。否则不链。

- ✅ 链接：项目产出的 skill、项目专属的工作流 skill
- ❌ 不链接：hdd、save-game、load-game 等所有项目都用的通用 skill

### AGENTS.md 分工

- **AGENTS.md**：只放路由规则和元规则（"新 skill 必须有项目归属"）
- **SKILL.md**：放具体方法（怎么做、步骤、参考）
- 不要把具体方法堆进 AGENTS.md

---

## 项目结构（三层分级）

### Tier 1: 轻量级

一次性修复、探索性工作、已完成的小任务。

```
memory/projects/<name>/
└── <name>.md              # 单文件：背景 + 结论
```

判断：一两个 session 完成，不会持续迭代。

### Tier 2: 标准

跨天/跨周、有明确阶段、持续迭代的项目。

```
memory/projects/<name>/
├── HANDOFF.md             # 当前状态 + 下一步（必须）
├── product-plan.md        # 目标 + 架构（有产品目标时）
└── skills/                # 直接关联 skills 的 symlink
```

判断：多 session 工作，有阶段划分，预期继续迭代。

### Tier 3: 复杂

大型系统、多子系统、长期维护（>1 月）。

```
memory/projects/<name>/
├── README.md              # 入口导航（文件地图 + 快速链接）
├── product-plan.md        # 产品计划
├── HANDOFF.md             # 交接文档
├── dev-log.md             # 开发日志（决策历史）
└── skills/                # 直接关联 skills 的 symlink
```

判断：有代码产出、多子系统、预期维护 > 1 月。

---

## 新建项目流程

### 1. 确定名称和层级

- 小写字母 + 连字符（如 `follow-up-tracker`）
- 检查 `memory/projects/` 无同名/相似项目
- 根据判断标准选 Tier

### 2. 创建文件夹 + 文档

```bash
mkdir -p memory/projects/<name>
```

### 3. HANDOFF.md 模板（Tier 2+）

```markdown
# <项目名> 交接文档

> 最后更新：YYYY-MM-DD HH:MM | v1
> 下次 agent 读这一个文件就够了

## 🎯 项目目标
## 📍 当前进展
## ➡️ 下一步
## 关键经验 & 铁律
## 架构
```

---

## Tier 升级

项目可以从低 Tier 升到高 Tier，补齐文档即可。

- Tier 1 → 2：项目开始跨 session 迭代
- Tier 2 → 3：代码规模增长、多人/多 agent 协作

---

## 查缺补漏

对已有项目按其 Tier 检查：

**Tier 1：**
- [ ] `<name>.md` 存在且有背景说明

**Tier 2：**
- [ ] HANDOFF.md 存在且结构完整（目标/进展/下一步/架构/铁律）
- [ ] skills/ 目录存在且 symlink 指向**直接关联**的 skills
- [ ] AGENTS.md 里相关路由规则已同步

**Tier 3（在 Tier 2 基础上）：**
- [ ] README.md 存在（入口导航 + 文件结构图）
- [ ] dev-log.md 存在（至少记录关键决策）

---

## 依赖关系

- **前置**：`memory-deposit`（项目文档存在 memory/ 下，需要 git 版本管理）
- **被依赖**：`save-game` / `load-game`（操作项目的 HANDOFF.md）
