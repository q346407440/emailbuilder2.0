#!/bin/bash
# 生产运行：仅启动后端 API。前端静态资源由 Nginx 提供。

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND_PORT=3001

[ -f "$SCRIPT_DIR/.env" ] && set -a && . "$SCRIPT_DIR/.env" && set +a
[ -f "$SCRIPT_DIR/server/.env" ] && set -a && . "$SCRIPT_DIR/server/.env" && set +a

if [ -z "$DATABASE_URL" ]; then
  echo "錯誤：請先設定 DATABASE_URL（專案根目錄或 server/.env）。"
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/server/dist/src/index.js" ]; then
  echo "錯誤：缺少後端構建產物，請先執行 ./build-prod.sh"
  exit 1
fi

if [ ! -f "/var/www/emailbuilder2.0/index.html" ]; then
  echo "錯誤：缺少前端靜態產物，請先執行 ./build-prod.sh"
  exit 1
fi

PID=$(lsof -ti:$BACKEND_PORT 2>/dev/null) || true
if [ -n "$PID" ]; then
  echo "結束佔用埠 $BACKEND_PORT 的進程: $PID"
  kill -9 $PID 2>/dev/null || true
  sleep 1
fi

echo "啟動後端 (NODE_ENV=production, http://localhost:$BACKEND_PORT)..."
exec bash -c "cd \"$SCRIPT_DIR/server\" && PORT=\"$BACKEND_PORT\" NODE_ENV=production npm run start"
