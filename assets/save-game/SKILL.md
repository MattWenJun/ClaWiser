---
name: save-game
description: 项目存档（Save Game）。审视→反思→调整→写交接，不只是抄状态。在工作段结束、compaction 即将发生、移交子 agent、或设定未来检查点时执行。当用户说"存档"、"写交接"、"save game"、"记一下进度"时触发。
version: 0.1.0
author: MindCode
tags: [project-management, handoff, clawiser]
---

# Save Game — 项目存档

**存档不是"把当前状态抄到文件里"——是一轮完整的 review + 调整 + 交接。**

写出来的 HANDOFF.md 是给**下次启动项目的 agent** 看的。它读完这一个文件就能理解目标、知道进度、知道下一步。

## 存档流程

### Step 0: 定位项目

1. 搜索已有项目：`ls memory/projects/` + `memory_search` 搜项目关键词
2. 找到匹配的 → **先读旧 HANDOFF.md 再写新的**，不能覆盖旧内容
3. 没找到 → 创建 `memory/projects/<name>/`

两个禁忌：
- ❌ 明明有项目却新建（重复）
- ❌ 把新项目塞进不相关的旧项目（混淆）

### Step 1: Review 工作进展

回顾这个工作段：
- 完成了哪些任务？做到了什么程度？
- 产出了哪些文件/代码/配置？（列出具体路径）

### Step 2: 对比原有计划

找到原始计划（HANDOFF.md 的"下一步"、product-plan.md 等），逐项对比：

| 检查项 | 回答 |
|--------|------|
| 计划完成的完成了吗？ | |
| 出现了计划外的工作吗？ | |
| 有什么计划了但没做的？为什么？ | |

### Step 3: 提炼经验和教训

- **有效的做法**：什么决策/方案被验证有效？
- **踩的坑**：什么假设被推翻了？根因是什么？
- **意外发现**：过程中发现了什么不在计划内的信息？

关键问题：**这些经验是否影响后续计划？**

### Step 3.5: 产出封装检查

回顾产出清单，逐项判断：

1. **需要持久化的**（数据、配置、文档）→ 直接写文件
2. **需要封装为 skill 的**（可复用工作流）→ **不在 save-game 里执行**，写入 HANDOFF.md 的"下一步"作为待办
3. **都不是** → 跳过

为什么不当场封装：save-game 通常发生在 context 快满时，skill 设计需要讨论确认，多轮对话会让 context 爆掉。

### Step 4: 评估计划调整

原有计划还成立吗？

- 成立 → 直接进 Step 5
- 不成立 → 确定调整方案，**更新受影响的所有文档**（不只是 HANDOFF）

### Step 5: 写 HANDOFF.md

存放位置：`memory/projects/<project>/HANDOFF.md`

```markdown
# <项目名> 交接文档

> 最后更新：YYYY-MM-DD HH:MM | v<N>
> 下次 agent 读这一个文件就够了

## 🎯 项目目标
## 📍 当前进展
## ➡️ 下一步
## 关键经验 & 铁律
## 架构
```

### 必写内容

| 字段 | 为什么 |
|------|--------|
| 项目目标 | 新 agent 要先理解"为什么" |
| ⚠️ 用真实名字 | HANDOFF 里用 USER.md/IDENTITY.md 的真实名字，不用通用的"用户"/"agent" |
| 当前进展 | 不查 git log 就知道做到哪了 |
| 下一步 | 不猜就知道接下来做什么 |
| 关键数字/ID | compaction 后会丢（cron ID、端口号、群 ID） |
| 铁律 | 踩过的坑不能重蹈 |

### Skill 关联检查

写完后检查：本次工作中新建了 skill 吗？如果与当前项目直接关联 → symlink 到项目。

---

## Deferred Check

当某个任务需要未来跟进时，存档后设 cron：

```bash
openclaw cron add --at "<时间>" --name "<项目>-check" \
  --session isolated --wake now --no-deliver \
  --message "读 memory/projects/<project>/HANDOFF.md，执行 load-game 恢复上下文，检查状态，汇报给用户。" \
  --delete-after-run
```

---

## 存档检查清单

- [ ] 旧文档读了吗？（不能直接覆盖）
- [ ] Step 1-4 都做了吗？（不是直接跳到写 HANDOFF）
- [ ] 经验/教训写了吗？
- [ ] 只读 HANDOFF 的新 agent 能理解项目全貌吗？
- [ ] 关键数字都写了吗？
- [ ] 新 skill 需要 symlink 到项目吗？
- [ ] 需要跟进的设了 cron 吗？

---

## 依赖关系

- **前置**：`project-skill-pairing`（项目结构和 Tier 分级）
- **配合**：`load-game`（存档的消费者）
