import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from '../server/app.js'

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-http-'))
  const server = createServer({ root })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }) })
  const url = `http://127.0.0.1:${server.address().port}`
  const config = await (await fetch(url + '/api/config')).json()
  const post = (body, headers = {}) => fetch(url + '/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TRPG-Token': config.token, ...headers }, body: JSON.stringify(body) })
  return { root, url, config, post }
}
test('HTTP 页面、静态资源与同源连接可用，启动不自动创建正式存档', async (t) => {
  const f = await fixture(t)
  for (const asset of ['/', '/app.js', '/style.css']) {
    const response = await fetch(f.url + asset)
    assert.equal(response.status, 200)
    assert(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"))
    assert((await response.text()).length > 100)
  }
  assert(!fs.existsSync(path.join(f.root, 'save')))
  assert.equal((await fetch(f.url + '/../../MEMORY.md')).status, 404)
})
test('HTTP 层拒绝跨站、缺令牌、错误 JSON 与超大请求', async (t) => {
  const f = await fixture(t)
  const request = { tool: 'trpg_save', mode: 'solo', slot: 'test', input: { op: 'demo' } }
  assert.equal((await f.post(request, { Origin: 'https://example.invalid' })).status, 403)
  assert.equal((await f.post(request, { 'X-TRPG-Token': 'bad' })).status, 403)
  assert.equal((await f.post(request, { 'Content-Type': 'text/plain' })).status, 415)
  assert.equal((await f.post({ ...request, padding: 'x'.repeat(70000) })).status, 413)
  const bad = await fetch(f.url + '/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TRPG-Token': f.config.token }, body: '{bad' })
  assert.equal(bad.status, 400)
  assert(!fs.existsSync(path.join(f.root, 'save')))
})
test('真实 HTTP 操作保存中文并返回当前修订，重复请求不重复扣补给', async (t) => {
  const f = await fixture(t)
  const create = await f.post({ tool: 'trpg_save', mode: 'solo', slot: 'api', input: { op: 'demo', name: '风中的冒险家' }, requestId: 'new' })
  const initial = (await create.json()).result
  assert.equal(initial.state.characters.pc.name, '风中的冒险家')
  assert.equal(initial.revision, initial.state.revision)
  const buy = { tool: 'trpg_item', mode: 'solo', slot: 'api', input: { op: 'buy', type: '料理' }, requestId: 'buy', expectedRevision: 1 }
  const once = (await (await f.post(buy)).json()).result
  const retry = (await (await f.post(buy)).json()).result
  assert.equal(once.state.supplies, 2)
  assert.equal(retry.replayed, true)
  assert.equal(retry.state.supplies, 2)
  assert.equal((await f.post({ ...buy, requestId: 'stale' })).status, 400)
})
