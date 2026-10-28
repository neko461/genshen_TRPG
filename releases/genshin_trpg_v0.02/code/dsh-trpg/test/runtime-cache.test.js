import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Runtime } from '../engine/runtime.js'
import { Journal } from '../engine/journal.js'

const run = promisify(execFile)
function fixture(t, options) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-cache-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runtime = new Runtime({ root, ...options })
  const call = (input, slot = 'case', extra = {}) => runtime.execute({ tool: 'trpg_save', mode: 'solo', slot, input, ...extra })
  call({ op: 'new' })
  return { root, runtime, call }
}

test('同一Runtime反复load复用日志，其他Runtime追加后立即可见', t => {
  const f = fixture(t)
  const file = path.join(f.root, 'save', 'slots', 'solo', 'case', 'journal.jsonl')
  const original = fs.readFileSync
  let reads = 0
  fs.readFileSync = function (target, ...args) {
    if (String(target) === file) reads++
    return original.call(this, target, ...args)
  }
  try {
    f.call({ op: 'load' }); f.call({ op: 'load' }); f.call({ op: 'load' })
    assert.equal(reads, 1)
    new Runtime({ root: f.root }).execute({ tool: 'trpg_narrate', mode: 'solo', slot: 'case', input: { text: '外部追加。' } })
    assert.equal(f.call({ op: 'load' }).state.notes.at(-1), '外部追加。')
  } finally { fs.readFileSync = original }
})

test('缓存数量与字节均有上限，可禁用并保持结果一致', t => {
  const f = fixture(t, { journalCacheSize: 2, journalCacheBytes: 4096 })
  for (const slot of ['a', 'b', 'c', 'd']) {
    f.call({ op: 'new' }, slot)
    f.call({ op: 'load' }, slot)
    assert.ok(f.runtime.journalCacheInfo.entries <= 2)
    assert.ok(f.runtime.journalCacheInfo.bytes <= 4096)
  }
  f.runtime.clearJournalCache()
  assert.equal(f.runtime.journalCacheInfo.entries, 0)
  const uncached = new Runtime({ root: f.root, journalCacheSize: 0 })
  assert.deepEqual(uncached.execute({ tool: 'trpg_save', mode: 'solo', slot: 'case', input: { op: 'load' } }).state, f.call({ op: 'load' }).state)
  assert.equal(uncached.journalCacheInfo.entries, 0)
})

test('同长改写并恢复mtime仍重新校验；截断完整合法版本可重新载入', t => {
  const f = fixture(t)
  const file = path.join(f.root, 'save', 'slots', 'solo', 'case', 'journal.jsonl')
  const original = fs.readFileSync(file, 'utf8')
  f.call({ op: 'load' })
  const stat = fs.statSync(file)
  assert.match(original, /"day":1/)
  fs.writeFileSync(file, original.replace('"day":1', '"day":9'))
  fs.utimesSync(file, stat.atime, stat.mtime)
  assert.throws(() => f.call({ op: 'load' }), /校验/)
  fs.writeFileSync(file, original)
  assert.equal(f.call({ op: 'load' }).state.world.day, 1)
  new Runtime({ root: f.root }).execute({ tool: 'trpg_narrate', mode: 'solo', slot: 'case', input: { text: '稍后的记录' } })
  f.call({ op: 'load' })
  fs.writeFileSync(file, original)
  assert.equal(f.call({ op: 'load' }).state.revision, 1)
})

test('跨进程仍遵守事务锁和expectedRevision，竞争写入仅一次成立', async t => {
  const f = fixture(t)
  const runtimeURL = new URL('../engine/runtime.js', import.meta.url).href
  const source = `import { Runtime } from ${JSON.stringify(runtimeURL)};
    const r = new Runtime({ root: process.argv[1] });
    try { r.execute({tool:'trpg_narrate', mode:'solo', slot:'case', input:{text:'并发提交'}, expectedRevision:1}); console.log('committed') }
    catch(e) { console.log(e.message) }`
  const lock = path.join(f.root, 'save', 'slots', 'solo', 'case', '.transaction.lock')
  fs.writeFileSync(lock, 'parent holds transaction')
  const locked = await run(process.execPath, ['--input-type=module', '-e', source, f.root])
  assert.match(locked.stdout, /事务锁/)
  fs.unlinkSync(lock)
  const outputs = await Promise.all([run(process.execPath, ['--input-type=module', '-e', source, f.root]), run(process.execPath, ['--input-type=module', '-e', source, f.root])])
  assert.equal(outputs.filter(result => result.stdout.trim() === 'committed').length, 1)
  assert.equal(f.call({ op: 'load' }).state.revision, 2)
  assert.equal(new Journal(f.root, 'solo', 'case').verify().valid, true)
})
