#!/usr/bin/bash
# 在服务器上运行：
# 作用：导出当前线上项目、数据库、Nginx/systemd 配置为一个交付包。

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
OUT_BASE="${OUT_BASE:-/root}"
WORK_DIR="$OUT_BASE/emailbuilder2.0-handoff-export"
TIMESTAMP="$(date +%F-%H%M%S)"
ARCHIVE_PATH="$OUT_BASE/emailbuilder2.0-handoff-$TIMESTAMP.tar.gz"
KEEP_ARCHIVES="${KEEP_ARCHIVES:-1}"

echo "[1/7] 准备目录..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/project" "$WORK_DIR/database" "$WORK_DIR/infra/nginx/default.d" "$WORK_DIR/infra/systemd" "$WORK_DIR/docs"
command -v tar >/dev/null
command -v sha256sum >/dev/null

echo "[2/7] 复制项目快照..."
PROJECT_PARENT="$(dirname "$PROJECT_DIR")"
PROJECT_NAME="$(basename "$PROJECT_DIR")"
tar -C "$PROJECT_PARENT" \
  --exclude="$PROJECT_NAME/node_modules" \
  --exclude="$PROJECT_NAME/server/node_modules" \
  --exclude="$PROJECT_NAME/server/logs" \
  --exclude="$PROJECT_NAME/scripts/local/.deploy-archives" \
  --exclude="$PROJECT_NAME/dist" \
  --exclude="$PROJECT_NAME/server/dist" \
  -cf - "$PROJECT_NAME" \
  | tar -C "$WORK_DIR/project" --strip-components=1 -xf -

echo "[3/7] 导出数据库..."
sudo -u postgres pg_dump -Fc "email_editor" -f "/var/lib/pgsql/backups/email_editor-current.dump"
cp "/var/lib/pgsql/backups/email_editor-current.dump" "$WORK_DIR/database/"

echo "[4/7] 复制部署配置..."
cp "/etc/systemd/system/emailbuilder-prod.service" "$WORK_DIR/infra/systemd/"
cp "/etc/nginx/nginx.conf" "$WORK_DIR/infra/nginx/"
cp "/etc/nginx/default.d/emailbuilder.conf" "$WORK_DIR/infra/nginx/default.d/"

echo "[5/7] 复制项目内文档与脚本..."
[ -f "$PROJECT_DIR/DEPLOYMENT_WORKFLOW.md" ] && cp "$PROJECT_DIR/DEPLOYMENT_WORKFLOW.md" "$WORK_DIR/docs/" || true
[ -d "$PROJECT_DIR/scripts" ] && cp -a "$PROJECT_DIR/scripts" "$WORK_DIR/" || true
[ -f "$PROJECT_DIR/.deploy.env.example" ] && cp "$PROJECT_DIR/.deploy.env.example" "$WORK_DIR/" || true

echo "[6/7] 打包..."
tar -C "$OUT_BASE" -czf "$ARCHIVE_PATH" "$(basename "$WORK_DIR")"
sha256sum "$ARCHIVE_PATH" > "$ARCHIVE_PATH.sha256"

echo "[7/7] 清理旧交付包（保留最新 $KEEP_ARCHIVES 个）..."
if [ "$KEEP_ARCHIVES" -ge 0 ]; then
  mapfile -t OLD_ARCHIVES < <(ls -1t "$OUT_BASE"/emailbuilder2.0-handoff-*.tar.gz 2>/dev/null | awk "NR>$KEEP_ARCHIVES")
  if [ "${#OLD_ARCHIVES[@]}" -gt 0 ]; then
    rm -f "${OLD_ARCHIVES[@]}"
  fi
  mapfile -t OLD_SUMS < <(ls -1t "$OUT_BASE"/emailbuilder2.0-handoff-*.tar.gz.sha256 2>/dev/null | awk "NR>$KEEP_ARCHIVES")
  if [ "${#OLD_SUMS[@]}" -gt 0 ]; then
    rm -f "${OLD_SUMS[@]}"
  fi
fi

rm -rf "$WORK_DIR"

echo ""
echo "导出完成：$ARCHIVE_PATH"
echo "校验文件：$ARCHIVE_PATH.sha256"
echo "建议在你本地电脑执行："
echo "scp root@<服务器IP>:$ARCHIVE_PATH ."
