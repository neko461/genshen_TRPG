@echo off
chcp 65001 >nul
pushd "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请安装 Node.js 22 或更高版本后重试。
  pause
  exit /b 1
)
node code/dsh-trpg/server/index.js --open
popd
pause
