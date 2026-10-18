import net from 'node:net'

// A different port still shares DSH_HOME and its per-session writer lock.
function listening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    const done = (value) => { socket.destroy(); resolve(value) }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(1000, () => done(false))
  })
}
const ports = [3080, 3081]
const results = await Promise.all(ports.map(listening))
const occupied = ports.filter((_, index) => results[index])
if (occupied.length) {
  console.error(`检测到本机端口 ${occupied.join('、')} 已有服务，停止重复启动。`)
  console.error('若是 DSH，请回到已有页面继续；需要重启时，先在原启动窗口按 Ctrl+C。')
  console.error('更换端口仍会共用聊天写锁，不能解决同一聊天被占用的问题。')
  process.exitCode = 1
}
