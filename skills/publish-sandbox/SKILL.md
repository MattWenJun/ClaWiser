---
name: publish-sandbox
description: 为 ClaWise 发布的脚本构建隔离测试沙盒，运行测试，检查本地环境污染，拆除脚手架。在测试任何即将发布到公开仓库的脚本时激活。触发词："测试脚本"、"跑一下公开版"、"sandbox test"、"检查污染"。
---

# Publish Sandbox — 发布测试沙盒

测试公开版脚本的三阶段流程：搭建 → 测试 → 拆除。核心原则：**绝不污染本地 workspace**。

## Phase 1: 搭建沙盒

### 1.1 创建隔离 workspace

```bash
SANDBOX="/tmp/clawise-sandbox-$(date +%s)"
mkdir -p "$SANDBOX/memory/voice" "$SANDBOX/memory/transcripts" "$SANDBOX/memory/projects"
```

### 1.2 复制只读资源（从真实 workspace）

只复制脚本运行所需的配置文件，不复制数据文件：

```bash
REAL_WS="$HOME/.openclaw/workspace"
# 配置文件（脚本可能读取的）
for f in USER.md IDENTITY.md SOUL.md AGENTS.md; do
  [ -f "$REAL_WS/$f" ] && cp "$REAL_WS/$f" "$SANDBOX/"
done
```

### 1.3 复制测试所需的数据（按需）

根据被测脚本决定复制哪些数据。**只复制，不 symlink**：

- merge 脚本 → 需要 voice JSONL：`cp $REAL_WS/memory/voice/YYYY-MM-DD.jsonl $SANDBOX/memory/voice/`
- auto-commit → 需要 git init + 模拟文件（不需要真实数据）

### 1.4 环境变量隔离

关键：用 `OPENCLAW_WORKSPACE` 环境变量指向沙盒，让脚本读写都在沙盒内：

```bash
export OPENCLAW_WORKSPACE="$SANDBOX"
```

**注意**：session JSONL 路径（`~/.openclaw/agents/main/sessions/`）是只读的，脚本只从中读取，不会写入。无需隔离。

### 1.5 记录基线快照

在运行任何测试之前，记录本地 workspace 的状态基线：

```bash
# 文件修改时间基线
find "$REAL_WS" -maxdepth 3 -type f -newer "$REAL_WS/AGENTS.md" \
  ! -path "*/.git/*" -exec stat -f "%m %N" {} \; | sort > /tmp/clawise-baseline.txt

# git 状态基线
cd "$REAL_WS" && git status --short > /tmp/clawise-git-baseline.txt
```

## Phase 2: 运行测试

### 2.1 运行被测脚本

始终带 `OPENCLAW_WORKSPACE` 运行：

```bash
OPENCLAW_WORKSPACE="$SANDBOX" node path/to/script.js [args] 2>&1
```

### 2.2 验证输出

- 检查输出文件是否生成在 `$SANDBOX/` 下（不是真实 workspace）
- 对比输出与预期（如果有本地版的已有输出，用 diff 对比，**但不要直接运行本地版脚本**）
- 检查 stderr 有无异常

### 2.3 对比测试（可选）

如果需要和本地版输出对比：
- ❌ **不要**直接运行本地版脚本（会覆盖真实文件）
- ✅ **用已有的历史输出文件**做 diff（如 `memory/transcripts/` 下已有的文件）
- ✅ 如果必须重新生成本地版输出，也要用 `OPENCLAW_WORKSPACE=/tmp/clawise-local-compare` 隔离

## Phase 3: 检查与拆除

### 3.1 污染检查

对比基线，找出测试期间被意外修改的文件：

```bash
cd "$REAL_WS"

# 1. git 状态对比
diff <(cat /tmp/clawise-git-baseline.txt) <(git status --short) || echo "⚠️ git 状态有变化"

# 2. 文件修改时间对比
find "$REAL_WS" -maxdepth 3 -type f -newer "$REAL_WS/AGENTS.md" \
  ! -path "*/.git/*" -exec stat -f "%m %N" {} \; | sort > /tmp/clawise-after.txt
diff /tmp/clawise-baseline.txt /tmp/clawise-after.txt || echo "⚠️ 有文件被修改"

# 3. 关键目录逐项检查
for dir in memory/transcripts memory/voice memory/projects scripts skills; do
  changes=$(diff <(cd "$REAL_WS" && git diff --name-only -- "$dir" 2>/dev/null) /dev/null 2>/dev/null)
  [ -n "$changes" ] && echo "⚠️ $dir 有改动: $changes"
done
```

### 3.2 污染修复（如果发现）

- gitignore 内的文件 → 检查是否有 `.compact.md` 备份可恢复
- git 跟踪的文件 → `git checkout -- <file>` 恢复
- 新增的垃圾文件 → `rm` 或 `trash`

### 3.3 拆除沙盒

```bash
rm -rf "$SANDBOX"
rm -f /tmp/clawise-baseline.txt /tmp/clawise-after.txt /tmp/clawise-git-baseline.txt
```

### 3.4 最终确认

```bash
ls -d /tmp/clawise-sandbox-* 2>/dev/null && echo "⚠️ 还有残留沙盒" || echo "✅ 沙盒已清理"
```

## 报告模板

测试完成后输出：

```
## Sandbox Test Report
- **被测脚本**: xxx
- **沙盒路径**: /tmp/clawise-sandbox-xxx (已清理)
- **测试结果**: ✅ 通过 / ❌ 失败
- **输出对比**: 与预期一致 / 差异: xxx
- **污染检查**: ✅ 无污染 / ⚠️ 发现并修复: xxx
- **残留清理**: ✅ 全部清理
```
