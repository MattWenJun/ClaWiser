---
name: clawise-bootstrap
description: ClaWise 套件初始化引导。首次安装后激活，完成环境检测、配置初始化、skill 本地适配。当用户说"初始化 ClaWise"、"setup skills"、"bootstrap"时触发。
version: 0.1.0-draft
tags: [bootstrap, setup, clawise]
---

# ClaWise Bootstrap — 套件初始化引导

> ⚠️ 本文件为草稿，仅"再具体化"章节完成。其余部分待补。

---

## 再具体化（Re-specification）

ClaWise 的 skill 以通用化形式发布——不含特定用户名、平台、路径。安装后需要根据用户的实际环境做本地适配。

### 三个档位

#### 强再具体化（自动检测 + 替换）

Agent 主动读取用户本地配置和环境，将通用描述替换为实际值。

**检测源：**
- OpenClaw config → `gateway(action=config.get)` 获取当前配置
- 环境变量 → 可用的 API key、provider
- 已安装工具 → `which` / `command -v` 检测 CLI 工具
- 文件系统 → workspace 结构、已有目录

**自动适配项：**

| 通用描述 | 检测方式 | 适配结果示例 |
|---------|---------|-------------|
| "搜索工具" | 检查 config 中可用的 search provider | → `grok_search` 或 `tavily_search` |
| "消息渠道" | 检查 config 中的 channel 配置 | → `telegram` 或 `discord` |
| "embedding provider" | 检查 memorySearch.provider | → `gemini` + 具体 model |
| "用户" / "你的用户" | 读 USER.md（如果存在） | → 用户实际名字 |
| "workspace 路径" | 读当前 cwd | → 实际绝对路径 |

**执行方式：** Agent 在首次加载 skill 时，自动读取环境信息，在自己的工作记忆中完成映射。不修改 SKILL.md 原文——适配结果存在 agent 的运行时上下文中。

#### 弱再具体化（列举常见选项）

当检测不到用户环境（隐私限制、配置未完成、或该项无法自动检测）时，列出常见选项供参考。

**示例：**
- "搜索工具（grok_search / tavily_search / web_fetch）"
- "消息渠道（telegram / discord / slack）"
- "embedding provider（gemini / openai / local / ollama）"

**原则：** 不猜、不假设。列举 3-5 个最常见的选项，用户看到后自己判断。

#### 不具体化（保持通用）

有些描述天然通用，不需要也不应该具体化：

- 方法论和流程（如 HDD 六步、save-game 六步）
- 抽象原则（如"搜索片段 ≠ 完整上下文"）
- 与平台无关的思维模型

**判断标准：** 如果具体化不会让 agent 执行得更好，就保持通用。

### 再具体化的执行时机

1. **首次安装**：bootstrap 流程中，对所有 skill 做一轮环境检测 + 适配
2. **配置变更后**：用户换了 provider / channel / 工具 → 触发重新适配
3. **新 skill 安装时**：单个 skill 的适配

### 再具体化不做的事

- ❌ 不修改 SKILL.md 源文件（适配在运行时，不在文件层）
- ❌ 不收集用户不愿提供的信息
- ❌ 不为了具体化而降低通用性（通用版是底线）
