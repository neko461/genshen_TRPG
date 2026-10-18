import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Runtime } from '../engine/runtime.js'
import { Journal } from '../engine/journal.js'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-facts-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runtime = new Runtime({ root, d6Source: () => 4, random: () => 0 })
  let seq = 0
  const call = (tool, input = {}, requestId = `fact_${++seq}`, expectedRevision) => runtime.execute({
    tool, mode: 'solo', slot: 'case', input, requestId, ...(expectedRevision === undefined ? {} : { expectedRevision }),
  })
  const read = () => call('trpg_save', { op: 'load' }).state
  const journal = new Journal(root, 'solo', 'case')
  call('trpg_save', { op: 'new' })
  return { call, read, journal }
}

test('facts 是只读编号清单，不增加 revision；correctFact替换当前事实而保留历史事件', t => {
  const f = fixture(t)
  f.call('trpg_state', { op: 'addFact', text: '未经核实的边境需要通行证' })
  f.call('trpg_state', { op: 'addFact', text: '林川尚未离开蒙德城' })
  const before = f.journal.records()
  const view = f.call('trpg_state', { op: 'facts' })
  assert.deepEqual(view.facts, [
    { factIndex: 1, text: '未经核实的边境需要通行证' },
    { factIndex: 2, text: '林川尚未离开蒙德城' },
  ])
  assert.equal(view.revision, before.length)
  assert.equal(f.journal.records().length, before.length, '只读查询不写入Journal')

  const correctionInput = { op: 'correctFact', factIndex: 1,
    expectedText: '未经核实的边境需要通行证', replacement: '没有已确认的通行证要求', reason: '玩家指出无设定依据' }
  const out = f.call('trpg_state', correctionInput, 'fact_correct_once', view.revision)
  const retry = f.call('trpg_state', correctionInput, 'fact_correct_once', view.revision)
  assert.equal(retry.replayed, true, '同请求重试返回原结果，不重复应用更正')
  assert.deepEqual(out.correction, { op: 'correctFact', factIndex: 1,
    before: '未经核实的边境需要通行证', after: '没有已确认的通行证要求', reason: '玩家指出无设定依据' })
  assert.deepEqual(f.read().world.known_facts, ['没有已确认的通行证要求', '林川尚未离开蒙德城'])
  const records = f.journal.records()
  assert.equal(records[2].after.world.known_facts[0], '未经核实的边境需要通行证', '旧Journal事件仍可审计')
  assert.equal(records.at(-1).input.op, 'correctFact')
  assert.equal(f.call('trpg_state', { op: 'facts' }).facts[0].text, '没有已确认的通行证要求')
})

test('retractFact从当前有效列表移除事实，历史快照不被改写', t => {
  const f = fixture(t)
  f.call('trpg_state', { op: 'addFact', text: '临时虚构的封路规定' })
  f.call('trpg_state', { op: 'addFact', text: '玩家在城门内侧' })
  const before = f.journal.records()
  f.call('trpg_state', { op: 'retractFact', factIndex: 1, expectedText: '临时虚构的封路规定', reason: 'GM确认该内容没有设定依据' }, undefined, before.length)
  assert.deepEqual(f.read().world.known_facts, ['玩家在城门内侧'])
  const after = f.journal.records()
  assert.equal(after[2].after.world.known_facts[0], '临时虚构的封路规定')
  assert.equal(after.length, before.length + 1)
})

test('expectedText防止陈旧编号误改，失败不写Journal', t => {
  const f = fixture(t)
  f.call('trpg_state', { op: 'addFact', text: '正确事实' })
  const count = f.journal.records().length
  const view = f.call('trpg_state', { op: 'facts' })
  assert.throws(() => f.call('trpg_state', { op: 'retractFact', factIndex: 1, expectedText: '其他内容', reason: '纠错' }, undefined, view.revision), /编号过期/)
  assert.throws(() => f.call('trpg_state', { op: 'correctFact', factIndex: 2, expectedText: '正确事实', replacement: '新事实', reason: '纠错' }, undefined, view.revision), /事实编号/)
  assert.throws(() => f.call('trpg_state', { op: 'retractFact', factIndex: 1, expectedText: '正确事实', reason: '纠错' }), /expectedRevision/)
  f.call('trpg_state', { op: 'addFact', text: '并发写入的另一条事实' })
  assert.throws(() => f.call('trpg_state', { op: 'retractFact', factIndex: 1, expectedText: '正确事实', reason: '纠错' }, undefined, view.revision), /状态已更新/)
  assert.equal(f.journal.records().length, count + 1, '只有中途追加的事实写入Journal')
  assert.deepEqual(f.read().world.known_facts, ['正确事实', '并发写入的另一条事实'])
})

test('retractFacts先校验整批，过期项使整批回滚；有效批次一次提交并按原编号报告', t => {
  const f = fixture(t)
  for (const text of ['错误A', '保留事实', '错误B']) f.call('trpg_state', { op: 'addFact', text })
  const count = f.journal.records().length
  const beforeView = f.call('trpg_state', { op: 'facts' })
  assert.throws(() => f.call('trpg_state', { op: 'retractFacts', items: [
    { factIndex: 1, expectedText: '错误A', reason: '无依据' },
    { factIndex: 3, expectedText: '已变化', reason: '过期编号' },
  ] }, undefined, beforeView.revision), /整批未修改/)
  assert.equal(f.journal.records().length, count)
  assert.deepEqual(f.read().world.known_facts, ['错误A', '保留事实', '错误B'])

  const currentView = f.call('trpg_state', { op: 'facts' })
  const out = f.call('trpg_state', { op: 'retractFacts', items: [
    { factIndex: 1, expectedText: '错误A', reason: 'GM撤回无依据内容' },
    { factIndex: 3, expectedText: '错误B', reason: '玩家指出与地图矛盾' },
  ] }, undefined, currentView.revision)
  assert.deepEqual(out.corrections.map(x => x.factIndex), [1, 3])
  assert.deepEqual(f.read().world.known_facts, ['保留事实'])
  assert.equal(f.journal.records().length, count + 1, '批量撤回原子写入一个事件')
})

test('事实纠错可在战斗场景中使用，不改变战斗状态', t => {
  const f = fixture(t)
  f.call('trpg_char', { op: 'create', id: 'pc', name: '战斗测试者' })
  f.call('trpg_state', { op: 'addFact', text: '错误路线情报' })
  f.call('trpg_scene', { op: 'open', goal: '事实纠错探针', location: '蒙德城门' })
  f.call('trpg_combat', { op: 'start', enemies: [{ id: 'slime', template: '史莱姆' }] })
  const before = f.read().battle
  const view = f.call('trpg_state', { op: 'facts' })
  f.call('trpg_state', { op: 'retractFact', factIndex: 1, expectedText: '错误路线情报', reason: '已确认误写' }, undefined, view.revision)
  const state = f.read()
  assert.deepEqual(state.world.known_facts, [])
  assert.deepEqual(state.battle, before)
})
