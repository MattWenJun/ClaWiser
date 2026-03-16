---
name: retrieval-enhance
description: 增强检索（Retrieval Enhance）。配置 OpenClaw 的记忆检索管线 + 教 agent 高级检索技术。包含两层：(1) 平台配置——hybrid search、MMR、temporal decay、embedding provider (2) agent 技术——Query Expansion、并行搜索、Self-Reranking。当用户说"增强记忆"、"搜索不准"、"搜不到东西"、"配置记忆搜索"、"retrieval enhance"时触发。也在首次搭建 OpenClaw 时作为记忆系统初始化步骤使用。
version: 0.2.0
author: Matt (MindCode)
tags: [memory, search, retrieval, clawise]
---

# Retrieval Enhance — 增强检索

记忆检索有两层优化空间：**平台配置**（OpenClaw 内置能力）和 **Agent 技术**（agent 自己的搜索策略）。两层独立生效，叠加效果最好。

---

## Part 1: 平台配置（OpenClaw memorySearch）

OpenClaw 的 `memory_search` 工具背后是一条可配置的检索管线：

```
查询 → Embedding → Vector Search ──┐
                                     ├─ Weighted Merge → Temporal Decay → MMR → Top-K
查询 → BM25 Keyword Search ────────┘
```

所有配置在 `agents.defaults.memorySearch` 下。用 `gateway(action=config.patch)` 修改。

### 1.1 Hybrid Search（向量 + 关键词混合）

默认只有向量搜索。开启 hybrid 后同时用 BM25 关键词匹配，大幅提升精确查询的召回率。

```json5
memorySearch: {
  query: {
    hybrid: {
      enabled: true,          // 开启混合搜索
      vectorWeight: 0.85,     // 向量权重（语义匹配）
      textWeight: 0.15,       // BM25 权重（精确匹配）
      candidateMultiplier: 6  // 候选池倍数（最终返回 N 条，先取 N×6 候选）
    }
  }
}
```

**什么时候调权重**：
- 搜 ID、代码符号、错误信息搜不到 → 提高 textWeight（如 0.3）
- 搜"大概意思"总返回不相关的精确匹配 → 提高 vectorWeight

### 1.2 MMR Re-ranking（多样性）

当搜索结果里多条内容高度相似（比如多天日志记了同一件事），MMR 会降低重复条目的排名，让结果覆盖更多不同信息。

```json5
memorySearch: {
  query: {
    hybrid: {
      mmr: {
        enabled: true,   // 默认 false，建议开启
        lambda: 0.7      // 0=最大多样性，1=纯相关性，0.7=均衡偏相关
      }
    }
  }
}
```

**什么时候开**：日志量大（每天写 daily notes）、同一话题跨多天出现。
**lambda 调整**：看到搜索结果全是同一段内容的翻版 → 降低 lambda（如 0.5）。

### 1.3 Temporal Decay（时间衰减）

最近的记忆优先。指数衰减公式：`score × e^(-λ × age_days)`，半衰期默认 30 天。

```json5
memorySearch: {
  query: {
    hybrid: {
      temporalDecay: {
        enabled: true,       // 默认 false，建议开启
        halfLifeDays: 30     // 30 天后分数减半
      }
    }
  }
}
```

效果：
- 今天的笔记：100% 原始分
- 7 天前：~84%
- 30 天前：50%
- 90 天前：12.5%

**不受衰减影响的文件**：`MEMORY.md` 和非日期命名的 memory 文件（如 `memory/projects.md`）被视为"常青文件"，不衰减。

**什么时候调半衰期**：经常需要搜 3 个月前的内容 → 设 90 天。主要关注最近 2 周 → 设 14 天。

### 1.4 Embedding Provider

```json5
memorySearch: {
  provider: "gemini",              // gemini / openai / local / ollama / voyage / mistral
  model: "gemini-embedding-001",   // 模型 ID
  fallback: "local",               // 主 provider 失败时的备选
  remote: {
    apiKey: "YOUR_API_KEY"         // 远程 provider 需要 API key
  },
  local: {
    modelPath: "path/to/model.gguf"  // 本地 GGUF 模型路径
  }
}
```

**推荐配置**：
- 有 API key → `gemini`（免费额度大）或 `openai`（text-embedding-3-small）
- 纯本地 → `local`（需要 GGUF 模型 + `pnpm approve-builds`）
- fallback 建议设一个，避免主 provider 挂了搜索完全不可用

### 1.5 Extra Paths（扩展索引范围）

默认只索引 `MEMORY.md` + `memory/**/*.md`。加更多文件：

```json5
memorySearch: {
  extraPaths: [
    "data/transcripts",   // 对话转写
    "AGENTS.md",          // 行为规则
    "TOOLS.md"            // 工具笔记
  ]
}
```

### 1.6 Embedding Cache

避免重复嵌入相同内容，节省 API 调用：

```json5
memorySearch: {
  cache: {
    enabled: true,
    maxEntries: 50000
  }
}
```

### 1.7 推荐初始配置

首次搭建时，一次性配置所有检索增强：

```json5
agents: {
  defaults: {
    memorySearch: {
      provider: "gemini",         // 或 "openai"
      model: "gemini-embedding-001",
      remote: { apiKey: "YOUR_KEY" },
      fallback: "local",
      extraPaths: ["data/transcripts", "AGENTS.md", "TOOLS.md"],
      query: {
        hybrid: {
          vectorWeight: 0.85,
          textWeight: 0.15,
          candidateMultiplier: 6,
          mmr: { enabled: true, lambda: 0.7 },
          temporalDecay: { enabled: true, halfLifeDays: 30 }
        }
      },
      cache: { enabled: true, maxEntries: 50000 }
    }
  }
}
```

---

## Part 2: Agent 技术（搜索策略）

平台配置解决"单次搜索的质量"。Agent 技术解决"单次搜索的盲区"。

### 2.1 强制触发场景

以下场景必须走 Part 2 流程，不能凭记忆直接答：

1. **Compaction 后回答之前的问题**
2. **用户问"之前聊过/做过/决定过 xxx"**
3. **跨概念/跨领域查询**
4. **回答视频/播客内容的追问** → 命中后优先回读 `data/transcripts/` 原始转写
5. **判断"有没有关于 X 的项目/文档/skill"** → 先 recall 再 `find` 文件系统确认
6. **探索性外部搜索**（找工具/选型/调研）

### 2.2 记忆搜索增强（Query Expansion + Parallel + Rerank）

#### Step 1: Query Expansion

生成 4 个变体 query：

1. **同义改写** — 完全不同的词表达同一件事
2. **中英切换** — 关键术语翻译
3. **关键词提取** — 去掉填充词，只留实体/动作/日期
4. **角度变换** — 可能出现在同一文档中的相关视角

#### Step 2: 并行搜索

用原始 query + 4 个变体，**并行**调用 `memory_search`：

```
memory_search(query="原始", maxResults=8)
memory_search(query="变体1", maxResults=8)
memory_search(query="变体2", maxResults=8)
memory_search(query="变体3", maxResults=8)
memory_search(query="变体4", maxResults=8)
```

5 个调用放在同一个 function_calls block 中并行执行。

#### Step 3: Self-Reranking

1. 合并 5 组结果
2. 按 path + lineRange 去重
3. 基于**原始意图**重新排序
4. 取 top 5-10 条
5. 未找到 → 换角度重搜（最多 2 轮）

### 2.3 外部搜索增强

对 grok_search、web_fetch 等外部搜索，同样做 Query Expansion：

1. **同义改写**
2. **抽象层级切换**（具体名字 → 问题描述）
3. **生态/平台扩展**（PyPI / npm / GitHub）
4. **用户视角**（别人怎么搜这个问题）

与记忆搜索的区别：**不需要每个变体都并行**（外部搜索有成本）。先搜最佳变体，不理想再补搜。

### 2.4 豁免条件

- 简单事实查询
- 内容还在当前上下文中
- 单次搜索第 1 条 score > 0.75 且精确命中
- 定向性外部搜索（已知目标）

---

## 诊断：搜索效果不好时怎么排查

| 症状 | 可能原因 | 排查 |
|------|---------|------|
| 搜到的内容都差不多 | MMR 没开 | 开 MMR，lambda 设 0.7 |
| 旧内容排在新内容前面 | temporal decay 没开 | 开 temporal decay |
| 搜 ID/代码搜不到 | textWeight 太低 | 提高到 0.3 |
| 语义相关但搜不到 | 只靠单次搜索 | 用 Query Expansion |
| transcript 内容搜不到 | extraPaths 没配 | 加 `data/transcripts` |
| 搜索很慢 | 没开缓存 | 开 embedding cache |

---

## 依赖关系

- **前置**：`memory-deposit`（向量搜索的数据来源）
- **平台依赖**：OpenClaw `memorySearch` 配置系统
