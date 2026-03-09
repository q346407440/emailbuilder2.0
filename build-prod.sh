#!/bin/bash
# 生产构建：仅构建，不启动服务。

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND_PORT=3001
BUILD_NODE_OPTIONS="${BUILD_NODE_OPTIONS:---max-old-space-size=2048}"
DEPLOY_DIST_DIR="${DEPLOY_DIST_DIR:-/var/www/emailbuilder2.0}"

[ -f "$SCRIPT_DIR/.env" ] && set -a && . "$SCRIPT_DIR/.env" && set +a
[ -f "$SCRIPT_DIR/server/.env" ] && set -a && . "$SCRIPT_DIR/server/.env" && set +a

if [ -z "$DATABASE_URL" ]; then
  echo "錯誤：請先設定 DATABASE_URL（專案根目錄或 server/.env）。"
  exit 1
fi

echo "建置後端..."
(cd "$SCRIPT_DIR/server" && NODE_OPTIONS="$BUILD_NODE_OPTIONS" npm run build)

echo "建置前端..."
NODE_OPTIONS="$BUILD_NODE_OPTIONS" npm run build

echo "同步前端靜態檔到 $DEPLOY_DIST_DIR ..."
mkdir -p "$DEPLOY_DIST_DIR"
rm -rf "$DEPLOY_DIST_DIR"/*
cp -a "$SCRIPT_DIR/dist/." "$DEPLOY_DIST_DIR/"
chmod -R a+rX "$DEPLOY_DIST_DIR"

echo "生產構建完成"
