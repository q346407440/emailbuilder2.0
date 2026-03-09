#!/usr/bin/bash
# 在服务器上运行：
# 作用：把服务器当前代码提交并推送到 Git。
# 注意：仅建议应急使用，不建议作为日常主流程。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$PWD/.deploy.env" ]; then
  # shellcheck disable=SC1091
  . "$PWD/.deploy.env"
elif [ -f "$SCRIPT_DIR/../../.deploy.env" ]; then
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/../../.deploy.env"
fi

PROJECT_DIR="${PROJECT_DIR:-/root/emailbuilder2.0}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_BRANCH="${GIT_BRANCH:-main}"
COMMIT_MSG="${1:-server sync: snapshot current production code}"

cd "$PROJECT_DIR"

echo "[1/4] 检查 Git 仓库..."
git rev-parse --is-inside-work-tree >/dev/null 2>&1

echo "[2/4] 查看当前状态..."
git status --short

echo "[3/4] 提交当前变更..."
if [ -z "$(git status --short)" ]; then
  echo "没有新的变更可提交。"
  exit 0
fi
git add .
git commit -m "$COMMIT_MSG"

echo "[4/4] 推送到远端分支 $GIT_REMOTE/$GIT_BRANCH ..."
git push "$GIT_REMOTE" "$GIT_BRANCH"

echo ""
echo "服务器推送完成。"
echo "提醒：日常仍建议先在本地提交 Git，再部署到服务器。"
