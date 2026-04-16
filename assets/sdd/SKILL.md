---
name: sdd
description: "Scenario-Driven Development (SDD) — produces scenario analyses, user-need definitions, and world-model documents (product-plan.md) before any implementation begins. Thinks through three layers: scene (who/when/what situation), need (the real problem, not the solution), and world model (agent role, capabilities, values, worldview that anchor architecture). Use when starting new projects, designing features from scratch, requirements are unclear, output 'works but feels wrong', or user says 'SDD一下', '想想场景', '设身处地想想', '这个是给谁用的', '用户会怎么用', '需求不太清楚', '做之前先想想'. Not for tasks with clear direction and known user profiles."
version: 0.3.0
author: MindCode
tags: [methodology, scenario-driven, clawiser]
---

# SDD — 场景驱动开发（Scenario-Driven Development）

**先回答"谁在什么场景下怎么用"，再回答"怎么实现"。**

常见错误：收到需求 → 直接开干 / 做技术方案 / 列功能清单。
正确顺序：收到需求 → **场景 → 需求 → 世界模型 → 判断依据 → 分步计划** → 然后才动手。

## 每个场景的三层定义

对每一个场景，依次回答三个问题。顺序不能乱，后一层从前一层推导。

### 第一层：场景（Scene）

**这件事发生在什么情境下？**

不是"用户要一个什么功能"，而是描述真实的情境——谁、在什么时候、面对什么状况。场景要具体到一个画面。

**检验标准**：读完场景，一个不了解这件事的人能想象出"此刻发生了什么"吗？能 → 够了。

### 第二层：用户需求（Need）

**在这个场景下，用户真正需要的是什么？**

需求不是解决方案。写需求时先否定一遍："不是 XXX，那是解决方案"。然后追问：他真正在问的问题是什么？

这一步的目的是把"我要一个 XX 功能"还原成"我面对的真正问题是什么"。方案可以有很多种，但问题只有一个。

### 第三层：我的世界模型（World Model）

**在这个场景和需求下，我（agent）是什么？**

这是 SDD 最关键的一层。世界模型定义了 agent 在这个场景中的身份，直接决定架构怎么设计。包含四个维度：

**角色定位**——我是什么，不是什么。同一个任务，"我是流水线工人"和"我是编辑"会推导出完全不同的架构。

**能力构成**——我有什么资源，哪个才是核心能力。工具和手段不是目的——要区分"我能做什么"和"我最该做什么"。

**价值观**——什么对我来说比什么更重要。当两个目标冲突时（比如覆盖率 vs 精准度），价值观决定取舍。

**世界观**——我对这个领域的基本认知。比如"信息服从幂律分布"这样的认知，会直接影响你设计全量扫描还是抽样处理。

**Key rule:** World model anchors architecture. If a technical design contradicts the world model, the design is wrong — not the model.

## 判断依据（什么算"好"）

每个场景定义**可验证的质量标准**。标准要具体到能回答"怎么验"——不能验证的标准等于没有标准。

## 分步计划（怎么一步步做到）

基于场景**反推**步骤：
- 第一步 = 最小可用（覆盖场景 1 的核心路径）
- 第二步 = 核心体验（覆盖场景 2）
- 后续 = 增强和优化

**不是按技术模块拆步骤，是按用户价值拆。**

## 常见陷阱

| 陷阱 | 表现 | 纠正 |
|------|------|------|
| 技术驱动 | "先做抓取，再做评分，再做推送" | 倒过来：推送什么样 → 需要什么评分 → 需要什么数据 |
| 功能堆砌 | 第一步就塞满功能 | 砍到只剩场景 1 能跑通的最小集 |
| 跳过场景 | 直接写任务列表 | 先写"用户每天看到什么" |
| 跳过世界模型 | 场景写完直接做技术方案 | 先回答"我在这个场景里是什么角色" |
| 假设未验 | "用 XX API 做搜索" → 没查过能不能用 | 每个关键假设走 HDD 验证 |
| 架构违反世界模型 | 世界模型说"覆盖率是约束"但方案在砍数量 | 回头检查世界模型，重新推导 |

## Mini Example

**Task:** Build a daily digest email for a dev team.

- **Scene:** Monday 9am, team lead opens inbox, wants a 30-second picture of weekend deploys, open incidents, and blocked PRs.
- **Need:** Not "an email tool" — the real need is "know if anything needs attention before standup."
- **World Model:** Role = triage nurse (surface urgency, not solve). Core capability = aggregation + prioritization. Value = recall > precision (miss nothing). Worldview = attention is scarce, every extra line costs reading time.
- **Judgment:** "Good" = lead can decide in 30s whether to dig deeper. Measurable: ≤5 items, each with severity + one-line summary.
- **Step plan:** Step 1 = incident + deploy summary (core path). Step 2 = blocked PR section. Step 3 = personalization.

## 产出物

完成 SDD 后，应产生：

1. **product-plan.md**（存 `memory/projects/<project>/`）
   - 场景定义（至少 2 个核心场景，每个含三层）
   - 判断依据（每个场景的质量标准）
   - 分步计划（按用户价值排序）
2. **第一步详细计划**
   - 任务列表 + 每个任务的验收标准
   - 依赖和阻塞项

**关键检查点**：技术架构必须从世界模型推导出来，不能反过来。

技术选型、架构设计在场景理清楚之后再做。

---

## 依赖关系

- **配合**：`hdd`（关键假设需要 HDD 验证）
- **产出消费者**：`project-skill-pairing`（product-plan.md 存入项目结构）
