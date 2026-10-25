#!/bin/bash
# 双击启动 commprobe：优先使用包内 runtime，其次系统 node；关闭本窗口即退出。
cd "$(dirname "$0")" || exit 1
if [ -x "./runtime/node" ]; then
  NODE="./runtime/node"
else
  NODE="node"
fi
if [ ! -f "server/dist/index.js" ]; then
  echo "[CommProbe] 缺少 server/dist/index.js，请先执行 npm run build 或重新解压完整目录。"
  read -r -p "按回车关闭…" _
  exit 1
fi
echo "[CommProbe] 正在启动，浏览器将自动打开；关闭本窗口即退出。"
exec "$NODE" server/dist/index.js "$@"
