#!/usr/bin/env bash
# 在你的电脑本地运行：
# 作用：先推送 Git，再部署到服务器。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$PWD/.deploy.env" ]; then
  # shellcheck disable=SC1091
  . "$PWD/.deploy.env"
elif [ -f "$SCRIPT_DIR/../../.deploy.env" ]; then
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/../../.deploy.env"
fi

SKIP_GIT="${SKIP_GIT:-0}"
COMMIT_MSG="${1:-}"

if [ "$SKIP_GIT" != "1" ]; then
  if [ -z "$COMMIT_MSG" ]; then
    echo "错误：请提供 Git 提交信息。"
    echo "示例：./scripts/local/release_all.sh \"feat: update production deployment workflow\""
    exit 1
  fi
  "$SCRIPT_DIR/push_to_git.sh" "$COMMIT_MSG"
fi

"$SCRIPT_DIR/deploy_to_server.sh"

echo ""
echo "一键发布完成。"
