# ClaWiser

**Agent 记忆与工作流增强套件** — 让你的 AI agent 拥有持久记忆、结构化工作流和自我优化能力。

## 包含什么

### 记忆层（需要初始化）
| 模块 | 功能 |
|------|------|
| **memory-deposit** | 6 层记忆系统：对话合并、向量召回、Git 版本管理 |
| **retrieval-enhance** | 搜索质量优化：query expansion、self-reranking、索引范围管理 |
| **noise-reduction** | 对话数据清洗：识别并过滤管道噪声，保留真实对话信号 |

### 工作流层（安装即用）
| 模块 | 功能 |
|------|------|
| **hdd** | 假设驱动开发：不确定的任务先验证假设再动手 |
| **sdd** | 场景驱动开发：动手前先想清楚场景、局面和判断依据 |
| **save-game / load-game** | 项目存档/读档：跨 session 保持项目上下文 |
| **project-skill-pairing** | 项目与 skill 配对：确保每个 skill 有项目归属 |

## 安装

把这个仓库 clone 到你的 agent skill 目录：

```bash
# OpenClaw
git clone https://github.com/MattWenJun/ClaWiser.git ~/.openclaw/skills/clawiser

# Claude Code
git clone https://github.com/MattWenJun/ClaWiser.git .claude/skills/clawiser
```

然后告诉你的 agent："运行 ClaWiser 初始化。"

## 适用平台

为 [OpenClaw](https://github.com/openclaw/openclaw) 设计，兼容 Claude Code 等支持 AgentSkills 规范的平台。

## License

MIT
