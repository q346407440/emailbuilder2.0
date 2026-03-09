#!/usr/bin/env bash
# 在你的电脑本地运行：
# 作用：把本地代码提交并推送到 Git。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$PWD/.deploy.env" ]; then
  # shellcheck disable=SC1091
  . "$PWD/.deploy.env"
elif [ -f "$SCRIPT_DIR/../../.deploy.env" ]; then
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/../../.deploy.env"
fi

LOCAL_PROJECT_DIR="${LOCAL_PROJECT_DIR:-$PWD}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_BRANCH="${GIT_BRANCH:-main}"
COMMIT_MSG="${1:-}"

cd "$LOCAL_PROJECT_DIR"

echo "[1/5] 检查 Git 仓库..."
git rev-parse --is-inside-work-tree >/dev/null 2>&1

echo "[2/5] 检查是否有变更..."
if [ -z "$(git status --short)" ]; then
  echo "没有需要提交的变更。"
  exit 0
fi

if [ -z "$COMMIT_MSG" ]; then
  echo "错误：请传入提交信息。"
  echo "示例：./scripts/local/push_to_git.sh \"chore: sync production deployment setup\""
  exit 1
fi

echo "[3/5] 暂存变更..."
git add -A

echo "[4/5] 提交变更..."
git commit -m "$COMMIT_MSG"

echo "[5/5] 推送到 $GIT_REMOTE/$GIT_BRANCH ..."
git push "$GIT_REMOTE" "$GIT_BRANCH"

echo ""
echo "Git 推送完成。"
