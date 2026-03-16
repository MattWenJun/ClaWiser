---
name: load-game
description: 项目读档（Load Game）。从 HANDOFF.md 恢复项目上下文，对比计划与实际，识别偏差并调整。触发场景：(1) Compaction 后恢复项目状态 (2) 接手别人/子 agent 的项目 (3) Cron 定时检查 (4) 跨天/跨周恢复工作。当用户说"读档"、"load game"、"恢复项目"、"review 进度"、"检查计划"时触发。
version: 0.1.0
author: MindCode
tags: [project-management, handoff, clawiser]
---

# Load Game — 项目状态恢复 + Review

**读档 = 定位存档 → 读 HANDOFF → 对比计划 → 发现偏差 → 调整 → 更新存档。**

不是"读完就开干"，是"读完先 review 再干"。

## 读档流程

### Step 0: 定位存档

**指定了项目** → 直接进 Step 1

**没指定 / 模糊指定** → 发现流程：

```bash
# 列出所有可用存档
for f in memory/projects/*/HANDOFF.md; do
  project=$(basename $(dirname "$f"))
  updated=$(head -5 "$f" | grep '最后更新' | head -1)
  echo "$project | $updated"
done
```

输出：
```
📂 可用存档：
1. paper-pipeline — v3, 2026-03-05 22:00
2. github-publish — v8, 2026-03-16 19:24
3. ...
```

模糊匹配：用户说"load 那个论文的" → 关键词匹配目录名 + HANDOFF 标题。唯一结果直接加载，多个结果列出让用户选。

零结果：`memory_search` 搜关键词 → 可能没有 HANDOFF.md，从 memory 文件重建。

### Step 1: 加载存档

```
读 memory/projects/<project>/HANDOFF.md
```

如果 HANDOFF.md 不存在或过时（>3 天未更新），先信息收集：
- `memory_search` 搜项目相关内容
- `ls memory/projects/<project>/` 看所有文档
- 读 product-plan.md 等规划文档
- 检查相关 cron job 状态

### Step 2: 对比计划 vs 实际

逐项核实：

| 检查项 | 怎么查 |
|--------|--------|
| "已完成"的真的完成了？ | 跑验证命令、查输出文件 |
| Cron job 还在跑？ | `openclaw cron list` |
| 阻塞项解除了？ | 查相关 API / 文件 / 状态 |
| 时间线还现实？ | 当前日期 vs 计划日期 |

### Step 3: 识别偏差 + 调整

| 级别 | 定义 | 处理 |
|------|------|------|
| 🔴 P0 | 阻塞后续工作 | 立即修复 |
| 🟡 P1 | 影响质量但不阻塞 | 本次 session 修 |
| 🟢 P2 | 优化项 | 记录，下次处理 |

调整方案**必须持久化**——更新到对应的计划文档，不能只在对话里说。

### Step 4: 更新存档

调整完成后，执行 `save-game` 更新 HANDOFF.md（版本号 +1）。

---

## 特殊场景

### Compaction 后读档

Compaction summary 只有骨架。**第一步读 HANDOFF.md，不是读 summary。**

1. 读 HANDOFF.md → 恢复项目全貌
2. 读当前对话的最后几条消息 → 确认用户最新指令
3. 最新指令优先级 > HANDOFF.md 里的"下一步"

### 子 Agent 接手

子 agent 的 prompt 应包含：
```
先读 memory/projects/<project>/HANDOFF.md，这是你的完整上下文。
按"下一步"里的第一个待做项开始工作。
完成后更新 HANDOFF.md。
```

### Cron 触发的定时 Check

```
读 memory/projects/<project>/HANDOFF.md，执行 load-game 恢复上下文。
检查到期的任务，汇报给用户。
```

---

## 读档检查清单

- [ ] 定位完成了吗？（不是猜项目名）
- [ ] HANDOFF.md 读了吗？（不是凭 summary 回忆）
- [ ] "已完成"的实际验证了吗？（不是看到 ✅ 就信了）
- [ ] 偏差识别了吗？
- [ ] 调整持久化了吗？
- [ ] 存档更新了吗？

---

## 依赖关系

- **前置**：`project-skill-pairing`（项目结构）、`save-game`（存档的生产者）
- **被触发**：compaction、cron、用户指令
