---
name: hdd
description: "Hypothesis-Driven Development (HDD) — validates hypotheses before acting on uncertain tasks. Seven-step workflow: Resource Mapping → Hypothesis Test (Bayesian priors + evidence levels V1-V5) → Plan Test → Acceptance Test Design → Development → AT Run → E2E. Diagnoses root causes, debugs issues, evaluates competing solutions, and gates architecture changes with evidence. Use when diagnosing bugs, choosing between solutions, making architecture decisions, or when user says 'HDD', '先验证一下', '为什么不work', '搞不定', '试了好几次都不行', '帮我排查一下'. Not for simple deterministic edits (changing copy, adding imports)."
version: 0.3.0
author: MindCode
tags: [methodology, debugging, clawiser]
---

# HDD: Hypothesis-Driven Development

七步流程：**Step 0 → HT → PT → AT Design → DEV → AT Run → E2E**

每个测试阶段的核心动作相同：**写测试用例 → 执行 → 判定通过/不通过**。
信息收集（查数据、搜网、读文档、跑命令）是写测试用例的输入，不是判定依据。

## 流程

### 0. Resource Mapping（资源映射）— 动手前必做

**最底层的错误假设，是假设了自己的能力边界而没有去核实。**

在提任何技术假设之前，先回答："我有哪些资源可以帮我解决这个问题？"

```
- 自身能力:
  - 平台工具、权限、配置: [我能直接做什么？有没有已有能力可以用？]
  - .env / credentials: [有没有未使用的认证或服务？]
- 本地知识:
  - 项目文档 / HANDOFF: [有没有已规划但未实现的方案？]
  - 已有代码/配置/脚本: [有没有相关但未启用的能力？]
  - memory / 文件系统: [之前讨论过这个问题吗？已有什么相关资料？]
- 外部资源:
  - 官方文档: [涉及的 API/工具有没有文档？先读完再动手]
  - 社区/搜索: [有没有已知的最佳实践？可以存为 reference 的现成方案？]
```

**为什么是 Step 0：** 如果跳过资源映射直接提假设，你会在错误的解空间里浪费时间——用笨办法绕过一个根本不存在的限制。

### 1. HT: Hypothesis Test（假设验证）

假设在被验证之前，无论多笃定，都只是假设，应默认大概率不为真。
验证必须基于可观测事实，不基于推理或反思。

#### 1.1 提出假设 & 赋先验

```
- 假设: [对问题根因/方案可行性的判断]
- 类型: 事后诊断 / 事前规划
- 先验: P(H) = [0.0-1.0]，依据: [参考类别]
```

Prior assignment (Reference Class Forecasting): No precedent → 0.05-0.15 | Known pattern → 0.2-0.4 | Direct analogy → 0.4-0.6 | Mechanism + analogy → 0.6-0.75.

**铁律：主观信心 ≠ 先验概率。**

#### 1.1b 中立性检查

1. **暂停修复思维**：HT 阶段禁止同时构思修复方案——这会污染验证的中立性
2. **预写证伪条件**：写验证测试前，先写"看到什么则假设为假"，与证实条件同等具体
3. **证伪 = 排除一条路**：正确反应是"好，少了一个可能"，然后换下一个假设

#### 1.2 自我攻击

1. **攻击 Ground Truth**：我的判断依据本身有没有破绽？有没有反例？
2. **检查其他可解释性**：同一现象是否有完全不同的解释？（问题可能不是"怎么做 X"而是"需不需要 X"）
3. **找反例**：已有事实中，有没有直接反驳假设的证据？

三项检查不通过 → 假设不成立，重新提假设。

#### 1.3 Evidence Levels

| Level | Type | Update strength |
|-------|------|----------------|
| **V1** | Controlled reproduction | Extreme |
| **V2** | Closed evidence chain (traceable + contiguous + exclusive) | High |
| **V3** | Partial chain (gaps or unexcluded alternatives) | Medium |
| **V4** | Analogical evidence from similar conditions | Low |
| **V5** | Pure reasoning/reflection | **Zero** |

**V5 rule:** Reasoning alone never validates a hypothesis. V2 requires: traceable source + contiguous chain (A→B→C, no jumps) + exclusivity (alternatives ruled out). Any condition unmet → V3.

#### 1.4 验证路径（按假设类型分流）

**事后诊断**（问题已发生，确认根因）：

- **刚性标准：必须达到 V2 或 V1**
- 推荐路径：先 V2（找痕迹闭合证据链），再 V1（复现确认）
- V3 及以下：假设仍为假设，不能用于指导 DEV

```
- 信息收集: [查日志/文件/状态 — 寻找直接痕迹]
- 证据链:
  - 痕迹1: [在哪发现的，说明了什么]
  - 痕迹2: [...]
  - 推导: 痕迹1 → 痕迹2 → 结论
  - 排他性: [是否排除了替代解释？如何排除？]
- 复现测试（如条件允许）:
  - 操作: [如何触发]
  - 预期: [如果假设为真应观测到什么]
  - 实际: [观测结果]
- 达到证据等级: V1 / V2 / V3
```

**事前规划**（事件尚未发生，确认机制可行性）：

整体事件尚未发生，不可能直接 V1/V2。
核心方法：**把机制拆成因果链，对每个环节单独验证。**
事前的 V1 不是对最终结果的复现，而是对每个因果箭头的微型复现。

刚性标准（必须满足，否则假设不可用于决策）：

1. **可证伪性**：假设必须有明确的"如果看到X，则假设为假"。不可证伪的假设不是假设，是信仰
2. **预注册**：成功/失败标准必须在执行前锁定，不允许事后调整标准适配结果（这是 AT Design 在 DEV 之前的底层理由）
3. **机制分解与逐环验证**：拆成因果链 A→B→C→D，每个箭头必须满足以下之一：
   - 有**直接类比证据**（过去相同环节在相似条件下成立过）
   - 可通过 **spike/原型**直接测试（对该环节做微型 V1）
   - 有**公认理论/文档支撑**（物理定律级确定性）
   - **任何一环不满足 → 标记为"未验证环节" → 整体降级为"有条件假设"**
4. **最高风险环节优先验证**：先验最接近 0.5 的环节，信息增益最大，优先做 spike

建议标准（不强制，但显著提高假设质量）：

5. **类比审判**：搜索历史上类似方案的成败记录，提供 base rate 锚定
6. **事前尸检（Pre-mortem）**：假设方案已失败，反推最可能的失败原因，每个原因作为子假设独立 HT
7. **爆炸半径评估**：假设为假时的损失决定验证力度

Blast radius: Reversible/low-cost → advisory standards suffice | Irreversible/medium → all mandatory standards | Irreversible/high → mandatory + independent controlled test.

```
- 可证伪条件: [看到什么则假设为假]
- 预注册标准: [成功 = ?, 失败 = ?]
- 因果链分解:
  - 环节A → B: 验证方式=[类比/spike/理论], 结果=[✅/❌/未验证]
  - 环节B → C: 验证方式=[...], 结果=[...]
  - 环节C → D: 验证方式=[...], 结果=[...]
- 未验证环节: [列出]
- 最高风险环节: [哪个], spike 结果: [...]
- 爆炸半径: 可逆低成本 / 不可逆中成本 / 不可逆高成本
- 达到证据等级: 每环 V? → 整体 V?
```

#### 1.5 判定

```
- 直接观测到了什么: [列出具体的观测事实，不含推理。写不出来 → V5]
- 证据等级: V[1-5]
- 后验估计: P(H|E) = [更新后的概率]
- 判定:
  - ✅ 验证通过（V1 或 V2）→ 进入 PT
  - ⚠️ 有条件通过（V3，存在未闭合环节）→ 标注风险，谨慎进入 PT
  - ❌ 验证未通过（V4/V5 或反证据）→ 替换假设，重跑 HT
```

**关键规则：**
- 不能提了假设就一直绕，必须先验证假设是否成立
- 假设不通过 → 必须替换假设，不能在错误假设上调方案
- V5（纯推理）永远不能作为通过依据

### 2. PT: Plan Test（方案验证）

提出方案，用测试用例验证可行性。

```
- 方案: [具体方案描述]
- 信息收集: [查文档/搜网/确认可行性 — 为写测试服务]
- 测试用例:
  - PT1: [方案前提是否成立] → 预期: [xxx] → 实际: [xxx] → ✅/❌
  - PT2: [关键参数是否可用] → 预期: [xxx] → 实际: [xxx] → ✅/❌
- 判定: ✅ 进入 AT Design / ❌ 调整方案 / ❌❌ 回退 HT
```

**回退规则：**
- PT 失败但假设没问题 → 调整方案，重跑 PT
- PT 失败且发现假设有问题 → 回退 HT，重新提假设

### 3. AT Design: Acceptance Test Design（验收用例编写）

在写代码之前，先定义"做完长什么样"。

```
- 验收标准:
  - AT1: [输入/操作] → 预期结果: [xxx]
  - AT2: [边界条件] → 预期结果: [xxx]
  - AT3: ...
```

**关键规则：**
- 必须在 DEV 之前完成
- 用例要具体可执行，不能是模糊描述

### 4. DEV: Development（开发）

基于 PT 方案 + AT 用例执行开发。

```
- 改动清单:
  - [文件1]: [改了什么]
  - [文件2]: [改了什么]
```

### 5. AT Run: Acceptance Test Run（验收测试执行）

执行 AT Design 中定义的用例。

```
- AT1: → 实际: [xxx] → ✅/❌
- AT2: → 实际: [xxx] → ✅/❌
- 判定: ✅ 进入 E2E / ❌ 回 DEV 修复
```

### 6. E2E: End-to-End Test（端到端验收）

由用户亲自验收。

```
- E1: [验收项] → ✅/❌
- E2: ...
- 判定: ✅ 完成 / ❌ 回退 DEV 或 PT
```

## 回退路径

```
HT ←────────────────────┐
 ↓ pass                  │
PT ←─────┐               │
 ↓ pass  │ PT fail       │ 根因在假设
AT Design│               │
 ↓       └→ 调整方案 ────┘
DEV
 ↓
AT Run ──→ fail → 回 DEV
 ↓ pass
E2E ────→ fail → 回 DEV 或 PT
 ↓ pass
Done ✅
```

### 收尾检查（E2E 通过后必做）

E2E 通过后，执行以下 checklist：

```
- [ ] 是否需要新建/更新项目文档？
- [ ] 是否有新的经验教训需要记录？
- [ ] 相关的 memory 文件是否已更新？
```

不满足任何一项可以跳过，但必须**逐项过一遍**再标记 Done。

## 何时使用

**需要 HDD（满足任一）：**
- 涉及"为什么"（诊断/debug）
- 涉及"哪种方案更好"（优化/选型）
- 改动影响上下游（架构/配置变更）
- 结果不确定，需要验证

**不需要 HDD：**
- 指令明确、结果确定（"把标题改成xxx"）
- 纯信息查询（"这个 API 怎么用"）
- 简单追加/删除操作

## 信息收集指引

HT 和 PT 阶段都可能需要信息收集，作为写测试用例的输入：

- **查本地文件**: 读配置、日志、源码
- **搜向量库**: 查历史决策和上下文
- **搜网**: 查文档、方案、已知问题
- **跑命令**: 验证环境、版本、状态

信息收集不是目的，写出可执行的测试用例才是。

## 补充参考（按需阅读）

以下内容已移至 `references/` 目录，在需要时读取：

- **`references/anomaly-detection.md`** — 异常模式识别：如何从数据分布中发现问题（HT 阶段前的观察能力）
- **`references/debug-techniques.md`** — 调试技术：逐步打桩、模拟 vs 真实验证、格式假设检查、减少调试来回
