import http from 'node:http'
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import { Runtime, VERSION } from '../engine/runtime.js'

export function createServer({ root, runtime = new Runtime({ root }) } = {}) {
  const token = randomBytes(24).toString('hex')
  const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] }
  const server = http.createServer(async (req, res) => {
    const port = server.address().port
    const origin = `http://127.0.0.1:${port}`
    const reply = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)) }
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'")
    if (req.headers.host !== `127.0.0.1:${port}`) return reply(403, { error: '请使用终端显示的 127.0.0.1 地址' })
    if (req.headers.origin && req.headers.origin !== origin) return reply(403, { error: '拒绝跨站请求' })
    if (req.method === 'GET' && req.url === '/api/config') return reply(200, { token, version: VERSION })
    if (req.method === 'GET' && files[req.url]) {
      const [name, mime] = files[req.url]
      res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8' })
      res.end(fs.readFileSync(new URL(`../web/${name}`, import.meta.url)))
      return
    }
    if (req.method !== 'POST' || req.url !== '/api') return reply(404, { error: '未找到接口' })
    if (req.headers['x-trpg-token'] !== token) return reply(403, { error: '连接令牌无效，请刷新页面' })
    if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { error: '只接受 JSON' })
    try {
      const chunks = []; let length = 0
      for await (const chunk of req) {
        chunks.push(chunk); length += chunk.length
        if (length > 65536) return reply(413, { error: '请求过大' })
      }
      const raw = Buffer.concat(chunks).toString('utf8')
      const result = runtime.execute(JSON.parse(raw))
      reply(200, { ok: true, result })
    } catch (e) { reply(400, { ok: false, error: e.message }) }
  })
  return server
}
