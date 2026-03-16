---
name: retrieval-enhance
description: 增强检索（Retrieval Enhance）。提升 memory_search 和外部搜索的召回率。强制触发场景：(1) Compaction 后回忆之前的状态 (2) 回答"之前聊过/做过/决定过"的问题 (3) 跨概念/跨领域查询 (4) 搜索视频/播客/文章内容 (5) 探索性外部搜索（找工具/选型/调研）。豁免：简单事实查询、刚讨论过的内容还在上下文中、单次搜索第 1 条精确命中（score > 0.75）。
version: 0.1.0
author: Matt (MindCode)
tags: [memory, search, retrieval, clawise]
---

# Retrieval Enhance — 增强检索

## 为什么存在

单次搜索有致命盲区：语义漂移、中英不对称、关键词锁死、平台盲区。本 skill 通过 **Query Expansion + 并行搜索 + Self-Reranking** 三步流程提升召回率。

适用于两个场景：
- **记忆搜索**（memory_search）：回忆之前的工作、决策、对话
- **外部搜索**（grok_search、web_fetch 等）：探索性调研、选型、事实验证

---

## Part 1: 记忆搜索增强

### 强制触发场景

以下场景必须走本流程，不能凭记忆直接答：

1. **Compaction 后回答之前的问题**
2. **引用/总结之前讨论过的内容**
3. **用户问"我们之前聊过/做过/决定过 xxx"**
4. **写周报/选题时查相关 ideas 和历史讨论**
5. **回答视频/播客内容的追问** → 命中后优先回读 `data/transcripts/` 原始转写
6. **判断"有没有关于 X 的项目/文档/skill"** → 先 recall 再 `find` 文件系统确认

### 执行 SOP（三步）

#### Step 1: Query Expansion

收到搜索需求后，生成 4 个变体 query：

1. **同义改写** — 同义词替换，完全不同的表达
2. **中英切换** — 关键术语翻译（中→英 或 英→中）
3. **关键词提取** — 去掉填充词，只留实体/动作/日期
4. **角度变换** — 可能出现在同一文档中的相关视角

#### Step 2: 并行搜索

用原始 query + 4 个变体，**并行**调用 `memory_search`（每个 maxResults=5-10）：

```
memory_search(query="原始 query", maxResults=8)
memory_search(query="变体1", maxResults=8)
memory_search(query="变体2", maxResults=8)
memory_search(query="变体3", maxResults=8)
memory_search(query="变体4", maxResults=8)
```

5 个调用放在同一个 function_calls block 中并行执行。

#### Step 3: Self-Reranking

1. 合并 5 组结果
2. 按 path + lineRange 去重（同一文件同一段只保留最高分）
3. 基于**原始 query 的真实意图**重新排序
4. 取 top 5-10 条用于回答
5. 未找到目标 → 换一组 query 角度重搜（最多 2 轮）

### 性能预算

整个流程 < 5 秒（expansion 0s + parallel search ~3s + rerank 0s）。

---

## Part 2: 外部搜索增强

### 触发场景

- "有没有 X 能做 Y 的工具/项目/方案"
- 技术选型、调研、对比
- 验证事实性信息（多角度交叉验证）
- 第一次搜索没找到满意结果

**不需要 expansion 的**：查天气、已知目标直接访问、跟进搜索。

### 执行 SOP

#### Step 1: Query Expansion

生成 3-4 个变体：

1. **同义改写** — 完全不同的关键词
2. **抽象层级切换** — 从具体名字上升到问题描述（"NotebookLM MCP" → "programmatic control NotebookLM"）
3. **生态/平台扩展** — 覆盖不同技术生态（PyPI / npm / GitHub）
4. **用户视角** — 别人遇到同样问题会怎么搜

#### Step 2: 搜索执行

与记忆搜索不同，**不需要每个变体都并行**（外部搜索有成本）：
- 先用最佳变体搜一次
- 结果不理想再用其他变体补搜
- 重要调研：2-3 次覆盖不同角度

#### Step 3: 综合判断

多次搜索结果合并，交叉验证，避免单一来源偏见。

### 性能预算

- 普通探索：1-2 次搜索
- 重要调研：2-3 次搜索

---

## 豁免条件（可跳过本 skill）

- 简单事实查询（"用户的 Telegram ID"）
- 刚讨论过的内容还在当前上下文中
- 单次搜索第 1 条结果 score > 0.75 且精确命中
- 定向性外部搜索（已知目标）

---

## 依赖关系

- **前置**：`memory-deposit`（向量搜索的数据来源）
- **被使用**：几乎所有需要回忆或调研的场景
