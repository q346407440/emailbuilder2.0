#!/usr/bin/env bash
# 在你的电脑本地运行：
# 作用：把本地项目打包上传到服务器，并在服务器上构建、重启服务。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$PWD/.deploy.env" ]; then
  # shellcheck disable=SC1091
  . "$PWD/.deploy.env"
elif [ -f "$SCRIPT_DIR/../../.deploy.env" ]; then
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/../../.deploy.env"
fi

SERVER_HOST="${SERVER_HOST:-root@111.230.53.224}"
SERVER_PROJECT_DIR="${SERVER_PROJECT_DIR:-/root/emailbuilder2.0}"
LOCAL_PROJECT_DIR="${LOCAL_PROJECT_DIR:-$PWD}"
KEEP_LOCAL_ARCHIVES="${KEEP_LOCAL_ARCHIVES:-0}"
REMOTE_TMP_DIR="${REMOTE_TMP_DIR:-/root/.deploy-tmp}"
TMP_NAME="emailbuilder2.0-deploy-$(date +%F-%H%M%S).tar.gz"
LOCAL_TAR="/tmp/$TMP_NAME"
REMOTE_TAR="$REMOTE_TMP_DIR/$TMP_NAME"

cleanup() {
  rm -f "$LOCAL_TAR"
  ssh "$SERVER_HOST" "rm -f '$REMOTE_TAR'" >/dev/null 2>&1 || true
}

trap cleanup EXIT

echo "[1/7] 检查本地目录..."
test -f "$LOCAL_PROJECT_DIR/package.json"
test -f "$LOCAL_PROJECT_DIR/build-prod.sh"
command -v ssh >/dev/null
command -v scp >/dev/null
command -v tar >/dev/null

echo "[2/7] 检查 SSH 连通性..."
ssh -o BatchMode=yes -o ConnectTimeout=10 "$SERVER_HOST" "echo connected" >/dev/null

echo "[3/7] 打包本地项目..."
tar -C "$LOCAL_PROJECT_DIR" \
  --exclude='node_modules' \
  --exclude='server/node_modules' \
  --exclude='dist' \
  --exclude='server/dist' \
  --exclude='server/logs' \
  --exclude='.git' \
  --exclude='.deploy-archives' \
  --exclude='.deploy.env' \
  -czf "$LOCAL_TAR" .

echo "[4/7] 上传到服务器..."
ssh "$SERVER_HOST" "mkdir -p '$REMOTE_TMP_DIR'"
scp "$LOCAL_TAR" "$SERVER_HOST:$REMOTE_TAR"

echo "[5/7] 服务器解包覆盖项目..."
ssh "$SERVER_HOST" "set -e;
  RELEASE_DIR='$REMOTE_TMP_DIR/release-${TMP_NAME%.tar.gz}';
  ENV_BAK='$REMOTE_TMP_DIR/.env.bak';
  SERVER_ENV_BAK='$REMOTE_TMP_DIR/server.env.bak';
  rm -rf \"\$RELEASE_DIR\";
  mkdir -p \"\$RELEASE_DIR\" '$SERVER_PROJECT_DIR';
  [ -f '$SERVER_PROJECT_DIR/.env' ] && cp '$SERVER_PROJECT_DIR/.env' \"\$ENV_BAK\" || true;
  [ -f '$SERVER_PROJECT_DIR/server/.env' ] && cp '$SERVER_PROJECT_DIR/server/.env' \"\$SERVER_ENV_BAK\" || true;
  tar -xzf '$REMOTE_TAR' -C \"\$RELEASE_DIR\";
  test -f \"\$RELEASE_DIR/package.json\";
  test -f \"\$RELEASE_DIR/build-prod.sh\";
  find '$SERVER_PROJECT_DIR' -mindepth 1 -maxdepth 1 -exec rm -rf {} +;
  cp -a \"\$RELEASE_DIR\"/. '$SERVER_PROJECT_DIR'/;
  [ ! -f '$SERVER_PROJECT_DIR/.env' ] && [ -f \"\$ENV_BAK\" ] && cp \"\$ENV_BAK\" '$SERVER_PROJECT_DIR/.env' || true;
  mkdir -p '$SERVER_PROJECT_DIR/server';
  [ ! -f '$SERVER_PROJECT_DIR/server/.env' ] && [ -f \"\$SERVER_ENV_BAK\" ] && cp \"\$SERVER_ENV_BAK\" '$SERVER_PROJECT_DIR/server/.env' || true;
  rm -rf \"\$RELEASE_DIR\" \"\$ENV_BAK\" \"\$SERVER_ENV_BAK\""

echo "[6/7] 在服务器上安装依赖并构建..."
ssh "$SERVER_HOST" "cd '$SERVER_PROJECT_DIR' && npm install && cd server && npm install && cd .. && ./build-prod.sh"

echo "[7/7] 重启服务并做健康检查..."
ssh "$SERVER_HOST" "systemctl restart emailbuilder-prod && systemctl restart nginx && rm -f '$REMOTE_TAR' && curl -fsS http://127.0.0.1/api/health >/dev/null && curl -fsS http://127.0.0.1/ >/dev/null"

if [ "$KEEP_LOCAL_ARCHIVES" -gt 0 ]; then
  ARCHIVE_DIR="$SCRIPT_DIR/.deploy-archives"
  mkdir -p "$ARCHIVE_DIR"
  cp "$LOCAL_TAR" "$ARCHIVE_DIR/$TMP_NAME"
  mapfile -t OLD_ARCHIVES < <(ls -1t "$ARCHIVE_DIR"/emailbuilder2.0-deploy-*.tar.gz 2>/dev/null | awk "NR>$KEEP_LOCAL_ARCHIVES")
  if [ "${#OLD_ARCHIVES[@]}" -gt 0 ]; then
    rm -f "${OLD_ARCHIVES[@]}"
  fi
fi

echo ""
echo "部署完成。可验证："
echo "  http://111.230.53.224/"
echo "  http://111.230.53.224/dashboard"
