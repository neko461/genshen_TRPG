import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createServer } from './app.js'
const root = process.env.TRPG_ROOT || fileURLToPath(new URL('../../..', import.meta.url))
const port = Number(process.env.TRPG_PORT ?? 17891)
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('TRPG_PORT 无效')
const server = createServer({ root })
server.on('error', (err) => { console.error(err.code === 'EADDRINUSE' ? '端口已占用：请使用已有试玩窗口，或关闭旧服务后重试。' : err.message); process.exitCode = 1 })
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}`
  console.log(`\ngenshin_trpg_v0.01 · 本地首轮试玩\n${url}\n仅在本机运行。按 Ctrl+C 结束；存档会保留。\n`)
  if (process.argv.includes('--open') && process.platform === 'win32') {
    const child = spawn('cmd.exe', ['/c', 'start', '', url], { windowsHide: true, stdio: 'ignore' })
    child.on('error', () => console.log('浏览器未自动打开，请复制上方地址。'))
  }
})
