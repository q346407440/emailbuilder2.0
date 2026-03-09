#!/bin/bash
# 線上模式一鍵啟動／重啟：先構建，再啟動 production。
# 為兼容舊命令保留此入口；實際邏輯拆分到 build-prod.sh / run-prod.sh。

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

"/usr/bin/bash" "$SCRIPT_DIR/build-prod.sh"
exec "/usr/bin/bash" "$SCRIPT_DIR/run-prod.sh"
