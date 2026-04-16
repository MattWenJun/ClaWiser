---
name: retrieval-enhance
description: "Retrieval system guardian — initializes memorySearch hybrid pipeline (embedding + BM25 + MMR dedup + temporal decay), diagnoses search quality degradation by routing to root causes (missing data, noise, misconfiguration), and performs periodic query-expansion tuning. Use when memorySearch returns empty or irrelevant results, when search recall drops, when setting up a new workspace, or during scheduled maintenance. Activates autonomously or when user says '搜不到东西', '记忆力不行', '为什么搜出来的都不是我要的', '检索系统', 'search quality'."
user-invocable: false
version: 0.3.0
tags: [memory, search, retrieval, clawiser]
---

# Retrieval Enhance — 检索系统守护

Initializes, diagnoses, and tunes the memorySearch pipeline. Agent activates autonomously or when search quality issues surface.

Three operating modes: **Init** (one-time setup) → **Diagnose** (event-driven root-cause analysis) → **Tune** (proactive query-expansion and parameter tuning).

---

## Mode 1: Init — 首次配置检索管线

**触发条件**：首次搭建 OpenClaw，或 `memory_search` 返回空 / 报错。只跑一次。

### 检索管线架构

```
Query → Embedding → Vector Search ──┐
                                     ├─ Weighted Merge → Temporal Decay → MMR → Top-K
Query → BM25 Keyword Search ────────┘
```

### Init 执行步骤

OpenClaw 出厂已开 hybrid search，但 MMR 去重、temporal decay、cache 默认关闭。Init 的核心任务就是把它们打开。

**Step 1：确认 embedding provider**

OpenClaw 会自动检测可用的 API key（Gemini → OpenAI → Voyage → Mistral），有 key 就自动启用向量搜索。

检查：`memory_search(query="test")`
- 有结果 → embedding 已就绪，跳到 Step 2
- 报错 / 无结果 → 问用户有没有 Gemini 或 OpenAI 的 API key，配上即可

**Step 2：打开出厂没开的功能**

用 `gateway(action=config.patch)` 写入：

```json5
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "query": {
          "hybrid": {
            "mmr": { "enabled": true, "lambda": 0.7 },
            "temporalDecay": { "enabled": true, "halfLifeDays": 30 }
          }
        },
        "cache": { "enabled": true, "maxEntries": 50000 }
      }
    }
  }
}
```

**Step 3：配置 extraPaths（按需）**

如果 workspace 里有其他包含重要内容的目录（转写存档、项目文档、参考资料），加入索引：

```json5
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "extraPaths": ["data/transcripts", "AGENTS.md", "TOOLS.md"]
      }
    }
  }
}
```

### Key Parameters

| Parameter | Purpose | When to adjust |
|-----------|---------|----------------|
| `mmr.lambda` | Dedup — prevents near-duplicate results | High log volume (enabled by default) |
| `temporalDecay.halfLifeDays` | Recency bias — score halves after N days | Need older content → increase to 90 |
| `vectorWeight` / `textWeight` | Semantic vs exact-match balance | Can't find IDs/code → raise textWeight |
| `extraPaths` | Expand index scope | Add transcript/doc directories |
| `cache` | Skip re-embedding unchanged content | Enabled by default |

---

## Mode 2: Diagnose — 搜索质量下降时的根因定位

**触发条件**：agent 发现搜索效果不对——top-1 score 低、结果明显不相关、已知存在的内容搜不到。

**关键原则：不假设是检索管线的问题。** "搜不到"有多种根因，先定位再修复。

### 诊断决策树

```
搜索结果不理想
├── 数据根本不在索引里？
│   ├── 是 → 检查 memory-deposit（归档流程没跑？extraPaths 没配？）
│   └── 不确定 → ls memory/ + find 相关目录确认文件存在
│
├── 数据在索引里但质量差？
│   ├── 噪声太多稀释向量空间 → 路由到 noise-reduction
│   └── 文件格式不规范（缺 frontmatter、编码乱）→ 修文件
│
├── 数据和索引都正常，但搜索策略不够？
│   ├── 单次搜索盲区 → 启用 Query Expansion（见 Mode 3 搜索技术）
│   ├── 搜到的全是重复 → 开 MMR 或降 lambda
│   ├── 旧内容压过新内容 → 开 temporal decay 或缩短 halfLife
│   └── 精确词搜不到 → 提高 textWeight
│
└── 以上都不是？
    └── embedding provider 问题 → 检查 API key / 模型 / fallback
```

### 自动修复路由

| 根因 | 修复方式 | 需要的 skill |
|------|---------|-------------|
| 归档没跑 | 手动触发 memory-deposit | memory-deposit |
| 噪声太多 | 跑 noise-reduction 清洗 | noise-reduction |
| 配置不对 | `gateway(action=config.patch)` 直接改 | 本 skill |
| embedding 挂了 | 检查 API key、切 fallback | 本 skill |
| 文件不在 extraPaths | 加路径到 extraPaths | 本 skill |

---

## Mode 3: Tune — 搜索技术 + 主动调优

### 搜索技术：Query Expansion

Single `memory_search` calls have blind spots: semantic drift, Chinese/English asymmetry, keyword gaps.

**必须走 expansion 的场景：**
- Compaction 后回答之前的问题
- 用户问"之前聊过/做过/决定过 xxx"
- 跨概念/跨领域查询
- 需要准确引用时 → 搜索命中后回读 source path 指向的原始文件（搜索片段 ≠ 完整上下文）
- 判断"有没有关于 X 的项目/文档/skill" → 先 recall 再 `find` 文件系统确认

**流程：**

#### Step 1: 生成 4 个变体 query

1. **同义改写** — 完全不同的词表达同一件事
2. **中英切换** — 关键术语翻译
3. **关键词提取** — 去填充词，只留实体/动作/日期
4. **角度变换** — 同一文档中可能出现的相关视角

#### Step 2: 并行搜索

原始 + 4 变体，5 个 `memory_search` 放在同一个 function_calls block 并行执行。

#### Step 3: Self-Reranking

合并 → 按 path+lineRange 去重 → 基于原始意图重排 → 取 top 5-10。未找到则换角度重搜（最多 2 轮）。

**豁免：** 简单事实查询、内容还在上下文中、单次搜索 score > 0.75 精确命中。

**Performance budget:** Full expansion < 5 seconds (parallel search ~3s).

### External Search Expansion

Apply expansion to `grok_search`, `web_fetch` etc., but **sequentially** (cost-aware). Try best variant first, supplement if needed.

### Periodic Tuning (heartbeat)

Sample recent search hit quality periodically:
1. Check top-1 score distribution for recent queries
2. Mean < 0.5 → investigate data or tune parameters
3. Excessive homogeneity → lower MMR lambda
4. Recent content missing → check temporal decay halfLife

---

## 依赖

- **数据层**：`memory-deposit`（没有数据，检索无意义）
- **数据质量**：`noise-reduction`（垃圾数据稀释向量空间）
- **平台**：OpenClaw `memorySearch` 配置系统
