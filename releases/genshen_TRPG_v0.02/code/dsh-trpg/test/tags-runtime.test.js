import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Runtime } from '../engine/runtime.js'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-tags-'))
  t.after(() => { assert.equal(path.dirname(root), os.tmpdir()); fs.rmSync(root, { recursive: true, force: true }) })
  const runtime = new Runtime({ root, d6Source: () => 4 })
  let id = 0
  const call = (tool, input, extra = {}) => runtime.execute({ tool, input, mode: 'solo', slot: 'tags', requestId: `tags_${++id}`, ...extra })
  const read = () => call('trpg_save', { op: 'load' }).state
  call('trpg_save', { op: 'new' })
  return { root, call, read }
}

test('结构化负标签从建卡、重载到真实检定保持 -1，旧字符串仍为 +1', (t) => {
  const f = fixture(t)
  f.call('trpg_char', { op: 'create', id: 'pc', name: '喵喵喵', tags: [{ name: '家境贫寒', modifier: -1, note: '缺乏财力' }, '轻小说作家', { name: '中性记录', modifier: 0, note: '' }] })
  const reloaded = new Runtime({ root: f.root, d6Source: () => 4 })
  const state = reloaded.execute({ tool: 'trpg_save', mode: 'solo', slot: 'tags', input: { op: 'load' } }).state
  assert.deepEqual(state.characters.pc.tags.map(t => t.modifier), [-1, 1, 0])
  f.call('trpg_scene', { op: 'open', goal: '财力影响下的交涉' })
  const result = f.call('trpg_check', { actor: 'pc', attribute: '交涉', tag: '家境贫寒' }).check
  assert.equal(result.breakdown.tag, -1)
  assert.equal(result.total, result.natural + state.characters.pc.attributes.交涉 - 1)
})

test('已建 pc 可修正标签，保留角色与资源；重试不重复提交且可回放', (t) => {
  const f = fixture(t)
  f.call('trpg_char', { op: 'create', id: 'pc', name: '喵喵喵', tags: ['家境贫寒', '写作', '观察'] })
  const before = f.read()
  const input = { op: 'setTags', id: 'pc', tags: [{ name: '家境贫寒', modifier: -1 }, '写作', '观察'], reason: '修正接口错误记录的标签符号', playerConfirmed: true }
  const first = f.call('trpg_char', input, { requestId: 'correction_once', expectedRevision: before.revision })
  const retry = f.call('trpg_char', input, { requestId: 'correction_once', expectedRevision: before.revision })
  assert.equal(retry.replayed, true)
  assert.equal(first.revision, retry.revision)
  assert.equal(first.correction.before[0].modifier, 1)
  assert.equal(first.correction.after[0].modifier, -1)
  const after = f.read()
  const originalActor = structuredClone(before.characters.pc)
  originalActor.tags = after.characters.pc.tags
  assert.deepEqual(after.characters.pc, originalActor)
  for (const key of ['supplies', 'inventory', 'sources', 'relations']) assert.deepEqual(after[key], before[key])
  assert.equal(f.call('trpg_save', { op: 'verify' }).valid, true)
})

test('非法符号、重复标签和未确认的修正全部拒绝且不改变存档', (t) => {
  const f = fixture(t)
  for (const modifier of [-2, 2, '-1', 0.5]) assert.throws(() => f.call('trpg_char', { op: 'create', id: 'pc', tags: [{ name: '家境贫寒', modifier }] }), /标签修正/)
  assert.throws(() => f.call('trpg_char', { op: 'create', id: 'pc', tags: ['同名', { name: '同名', modifier: -1 }] }), /重复/)
  assert.equal(f.read().revision, 1)
  f.call('trpg_char', { op: 'create', id: 'pc' })
  const before = f.read()
  assert.throws(() => f.call('trpg_char', { op: 'setTags', id: 'pc', tags: [], reason: '修正' }), /玩家确认/)
  assert.throws(() => f.call('trpg_char', { op: 'setTags', id: 'pc', tags: [], playerConfirmed: true }), /修正原因/)
  assert.deepEqual(f.read(), before)
})

test('场景和战斗中不能临时修标签，也不能借修正扩充成长位', (t) => {
  const f = fixture(t)
  f.call('trpg_char', { op: 'create', id: 'pc' })
  const correction = { op: 'setTags', id: 'pc', tags: ['甲', '乙', '丙', '丁'], reason: '修正', playerConfirmed: true }
  assert.throws(() => f.call('trpg_char', correction), /最多 3 个/)
  f.call('trpg_scene', { op: 'open', goal: '调查道路' })
  assert.throws(() => f.call('trpg_char', { ...correction, tags: [] }), /场景外/)
  f.call('trpg_combat', { op: 'start', enemies: [{ name: '丘丘人' }] })
  assert.throws(() => f.call('trpg_char', { ...correction, tags: [] }), /战斗中/)
})

test('成长接口接收负标签并保留来源去重，拒绝同名标签', (t) => {
  const f = fixture(t)
  f.call('trpg_char', { op: 'create', id: 'pc', tags: ['写作'] })
  const input = { op: 'grow', id: 'pc', source: 'chapter_reward', tag: { name: '家境贫寒', modifier: -1 } }
  const result = f.call('trpg_char', input)
  assert.equal(result.actor.tags.at(-1).modifier, -1)
  assert.throws(() => f.call('trpg_char', input), /来源已结算/)
  assert.throws(() => f.call('trpg_char', { ...input, source: 'other_reward' }), /重复/)
  assert.equal(f.read().characters.pc.tags.length, 2)
})
