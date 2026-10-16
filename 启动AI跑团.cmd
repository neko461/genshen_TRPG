@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0code\dsh-trpg"
where node >nul 2>nul
if errorlevel 1 goto missing_node
node scripts/check-dsh.mjs
if errorlevel 1 goto failed_check
node scripts/check-dsh-instance.mjs
if errorlevel 1 goto already_running
popd
pushd "%~dp0"
echo 正在打开 DeepSeek Harness。请使用本次自动打开的页面，并保持此窗口运行。
echo 请勿同时重复启动；需要重新加载插件时，先在原启动窗口按 Ctrl+C。
call npx @deepseek-ai/dsh web --port 3081
popd
pause
exit /b
:missing_node
echo 未找到 Node.js，请安装 Node.js 22 或更高版本。
popd
pause
exit /b 1
:failed_check
echo 插件检查未通过。请保留上方错误信息，不要使用旧的固定试玩入口。
popd
pause
exit /b 1
:already_running
echo 请使用已有 DSH 页面，不要另开端口重复启动同一套聊天目录。
popd
pause
exit /b 1
