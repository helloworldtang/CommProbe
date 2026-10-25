@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [CommProbe] 正在启动，浏览器将自动打开；关闭本窗口即退出。
if exist "runtime\node.exe" (
  set "NODE=runtime\node.exe"
) else (
  set "NODE=node"
)
if not exist "server\dist\index.js" (
  echo [CommProbe] 缺少 server\dist\index.js，请先在本项目执行 npm run build 或重新解压完整目录。
  pause
  exit /b 1
)
"%NODE%" server\dist\index.js %*
if errorlevel 1 pause
