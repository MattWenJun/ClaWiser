#!/bin/bash
# auto-commit.sh — 心跳兜底：检查未提交变更并按类型分组提交
# 用法：bash scripts/auto-commit.sh
# 在 HEARTBEAT.md 中配置定期运行
set -e
cd "$(dirname "$0")/.."

# 没有 git 就退出
[ -d .git ] || exit 0

# 没有变更就退出
if git diff --quiet 2>/dev/null && git diff --cached --quiet 2>/dev/null && \
   [ -z "$(git ls-files --others --exclude-standard 2>/dev/null | head -1)" ]; then
  exit 0
fi

# 按文件路径模式分组提交
commit_group() {
  local pattern="$1"
  local message="$2"
  local matched=0

  while IFS= read -r file; do
    [ -n "$file" ] || continue
    matched=1
    git add -- "$file" 2>/dev/null || true
  done < <(
    git status --short -uall | while IFS= read -r line; do
      file="${line:3}"
      [[ "$file" =~ $pattern ]] && printf '%s\n' "$file"
    done
  )

  if [ "$matched" -eq 1 ]; then
    git diff --cached --quiet 2>/dev/null || git commit -m "$message" 2>/dev/null
  fi
}

# 按类型分组提交
commit_group '^memory/ideas\.' "ideas: 更新想法池"

git status --short -uall | grep "memory/writings/" | while IFS= read -r line; do
  f="${line:3}"
  [ -n "$f" ] || continue
  fname=$(basename "$f" .md)
  git add -- "$f" 2>/dev/null
  git diff --cached --quiet 2>/dev/null || git commit -m "writings: 更新 $fname" 2>/dev/null
done

commit_group '^memory/voice/' "memory: 更新语音记录"
commit_group '^memory/[0-9][0-9][0-9][0-9]-' "memory: 更新每日笔记"
commit_group '^memory/projects/' "projects: 更新项目文档"
commit_group '^scripts/' "scripts: 更新脚本"
commit_group '^skills/' "skills: 更新技能"
commit_group '(^|/)[^/]+\.(md|json)$' "chore: 更新配置文件"

# 提交剩余
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null || \
   [ -n "$(git ls-files --others --exclude-standard 2>/dev/null)" ]; then
  git add -A 2>/dev/null
  git diff --cached --quiet 2>/dev/null || git commit -m "chore: 提交剩余变更" 2>/dev/null
fi

echo "auto-commit done"
