---
name: retrieval-enhance
description: 检索系统守护。静默运行——agent 自主判断何时激活。三种场景：(1) 首次搭建时初始化 memorySearch 管线 (2) 搜索质量下降时自动诊断根因并路由修复 (3) 定期抽检+调参。不由用户触发。
user-invocable: false
version: 0.3.0
tags: [memory, search, retrieval, clawiser]
---

# Retrieval Enhance — 检索系统守护

静默 skill。Agent 自主判断何时激活，用户不需要触发。

三种运行模式：**Init**（一次性配置）→ **Diagnose**（事件驱动诊断）→ **Tune**（主动调优）。

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

### 各参数说明

| 参数 | 作用 | 何时调整 |
|------|------|---------|
| `mmr.enabled` + `lambda` | 去重，防搜出一堆相似结果 | 日志量大时必须开（ClaWiser 默认帮你开） |
| `temporalDecay.halfLifeDays` | 最近的优先，30 天后分数减半 | 需要搜 3 月前 → 设 90 天 |
| `vectorWeight` / `textWeight` | 语义 vs 精确匹配权重 | 搜 ID/代码搜不到 → 提高 textWeight |
| `extraPaths` | 扩展索引范围 | 有 transcript、额外文档目录时加 |
| `cache` | 避免重复嵌入同一内容 | ClaWiser 默认帮你开 |

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

单次 `memory_search` 有致命盲区：语义漂移、中英不对称、关键词遗漏。

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

**性能预算：** 整个流程 < 5 秒（expansion 0s + parallel search ~3s + rerank 0s）。

### 外部搜索 Query Expansion

对 grok_search、web_fetch 等外部搜索同样做 expansion，但**不并行**（有成本）。先搜最佳变体，不理想再补搜。

变体策略：同义改写 + 抽象层级切换 + 生态平台扩展 + 用户视角。

### 主动调优（heartbeat 期间）

定期抽检最近 N 次搜索的命中质量：
1. 取最近搜索的 top-1 score 分布
2. 均值 < 0.5 → 可能需要调参或排查数据
3. 结果同质化严重 → 降低 MMR lambda
4. 近期内容搜不到 → 检查 temporal decay 半衰期

---

## 依赖

- **数据层**：`memory-deposit`（没有数据，检索无意义）
- **数据质量**：`noise-reduction`（垃圾数据稀释向量空间）
- **平台**：OpenClaw `memorySearch` 配置系统
