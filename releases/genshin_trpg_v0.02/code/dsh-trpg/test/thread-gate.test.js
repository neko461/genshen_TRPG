import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Runtime } from '../engine/runtime.js'
import { Journal } from '../engine/journal.js'
import { threadGate, inferThreadKind } from '../engine/threads.js'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-thread-gate-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const r = new Runtime({ root, d6Source: () => 4, random: () => 0 })
  let n = 0
  const call = (tool, input = {}) => r.execute({ tool, mode: 'solo', slot: 'case', input, requestId: `t_${++n}` })
  const read = () => call('trpg_save', { op: 'load' }).state
  call('trpg_save', { op: 'new' })
  call('trpg_char', { op: 'create', id: 'pc', name: '测试者' })
  const thread = (id, text, extra = {}) => call('trpg_state', { op: 'addThread', id, text, ...extra })
  const move = (extra = {}) => call('trpg_state', { op: 'nextStation', reason: '本章核心危机已实际解决并交代余波', ...extra })
  const view = () => call('trpg_state', { op: 'threads' })
  return { root, r, call, read, thread, move, view }
}

// ---------------------------------------------------------------- 分类与展示

test('切站前展示待处理线程及各自后果，并区分主线与支线', t => {
  const f = fixture(t)
  f.thread('dragon_core', 'wind_dragon', { kind: '主线' })
  f.thread('side_herbs', '把草药运回城内', { kind: '支线' })
  const v = f.view()
  assert.deepEqual(v.blocking, ['dragon_core'], '主线未收束应列为阻止换站')
  assert.equal(v.threadList.find(x => x.id === 'side_herbs').kind, '支线')
  assert.match(v.summary, /主线（必须实际完成）/, '展示须标出主线性')
  assert.match(v.summary, /支线（可完成\/放弃\/延期）/, '展示须标出支线可选处置')
  assert.deepEqual(v.threadList.find(x => x.id === 'side_herbs').actions, ['resolve', 'abandon', 'defer'])
  assert.deepEqual(v.threadList.find(x => x.id === 'dragon_core').actions, ['resolve'], '主线只允许实际完成')
})

test('展示包含已过期线索的实际后果', t => {
  const f = fixture(t)
  f.thread('herbs', '运回草药', { kind: '主线', deadlineDay: 1, deadlineConsequence: '闷过一夜会损坏，须查验品质' })
  f.call('trpg_recover', { level: '休整', reason: '在城内过夜' })
  const v = f.view()
  const item = v.threadList.find(x => x.id === 'herbs')
  assert.equal(item.overdue, true)
  assert.equal(item.deadlineConsequence, '闷过一夜会损坏，须查验品质')
  assert.match(v.summary, /已过期|已过第1日时限/)
})

test('旧档无线程分类时只读推断并在展示中标注，不写回存档', t => {
  const f = fixture(t)
  f.thread('legacy_side', '没有分类的旧线索')
  const journal = new Journal(f.root, 'solo', 'case')
  const events = journal.records()
  const after = structuredClone(events.at(-1).after)
  after.revision = events.length + 1
  // 模拟旧档：线程没有 kind 字段
  for (const th of after.world.threads) delete th.kind
  journal.appendRawForTest(after)
  assert.equal(inferThreadKind({ status: 'open' }), '支线')
  assert.equal(inferThreadKind({ status: 'open', deadlineDay: 1 }), '主线', '有时限的旧线索按主线保守处理')
  const v = f.view()
  assert.equal(v.threadList.find(x => x.id === 'legacy_side').kindSource, 'inferred')
  assert.match(v.summary, /旧档推断/)
  // 未写回：存档里的线程仍无 kind
  assert.equal(f.read().world.threads.find(x => x.id === 'legacy_side').kind, undefined)
})

test('classifyThread 可显式确认旧档分类，并记录前后值', t => {
  const f = fixture(t)
  f.thread('legacy', '旧线索')
  const journal = new Journal(f.root, 'solo', 'case')
  const events = journal.records()
  const after = structuredClone(events.at(-1).after)
  after.revision = events.length + 1
  delete after.world.threads.find(x => x.id === 'legacy').kind
  journal.appendRawForTest(after)
  const out = f.call('trpg_state', { op: 'classifyThread', id: 'legacy', kind: '主线', reason: '对照主线规则确认它属于风龙危机' })
  assert.equal(out.thread.kind, '主线')
  assert.equal(f.read().world.threads.find(x => x.id === 'legacy').kind, '主线')
  assert.throws(() => f.call('trpg_state', { op: 'classifyThread', id: 'legacy', kind: '未知', reason: 'x' }), /主线|支线/)
})

// ---------------------------------------------------------------- 拦截

test('关键主线未收束时阻止换站，且不能以放弃或延期绕过', t => {
  const f = fixture(t)
  f.thread('dragon_core', '特瓦林与深渊干预尚未处理', { kind: '主线' })
  const before = f.read()
  assert.throws(() => f.move(), /关键主线未收束/)
  assert.deepEqual(f.read(), before, '被拒的换站不得写档')
  assert.throws(() => f.call('trpg_state', { op: 'closeThread', id: 'dragon_core', outcome: 'abandoned', resolution: '不查了' }), /主线/)
  assert.throws(() => f.call('trpg_state', { op: 'deferThread', id: 'dragon_core', reason: '以后再说' }), /主线/)
  assert.deepEqual(f.read(), before, '主线的非法处置不得写档')
})

test('主线实际完成后才能换站', t => {
  const f = fixture(t)
  f.thread('dragon_core', '特瓦林与深渊干预', { kind: '主线' })
  f.call('trpg_state', { op: 'closeThread', id: 'dragon_core', outcome: 'resolved', resolution: '玩家协助净化特瓦林，城市风灾平息' })
  const out = f.move()
  assert.equal(out.timeline.index, 2)
  assert.equal(out.timeline.name, '璃月')
})

// ---------------------------------------------------------------- 支线三种处置

test('支线可完成、放弃或延期后再换站', t => {
  for (const [op, expectedOutcome] of [['resolved', 'resolved'], ['abandoned', 'abandoned']]) {
    const f = fixture(t)
    f.thread('side', '帮牧户修栅栏', { kind: '支线' })
    f.call('trpg_state', { op: 'closeThread', id: 'side', outcome: op, resolution: op === 'resolved' ? '栅栏修好了' : '离开时没修，牧户自己将就' })
    const t2 = f.read().world.threads.find(x => x.id === 'side')
    assert.equal(t2.outcome, expectedOutcome)
    assert.equal(f.move().timeline.index, 2)
  }
})

test('支线延期后随玩家带走并继续出现在待处理清单里', t => {
  const f = fixture(t)
  f.thread('side', '帮牧户修栅栏', { kind: '支线' })
  const out = f.call('trpg_state', { op: 'deferThread', id: 'side', reason: '玩家决定等回蒙德时再修' })
  assert.equal(out.thread.status, 'deferred')
  assert.equal(out.thread.deferredTo, 2)
  // 延期是玩家已做的决定，不再阻止换站
  assert.equal(f.move().timeline.index, 2)
  // 但线索没有被当成已完成：仍在待处理清单，且明确随行保留
  const v = f.view()
  assert.equal(v.threadList.length, 1)
  assert.equal(v.threadList[0].status, 'deferred')
  assert.deepEqual(v.deferred, ['side'])
  assert.match(v.summary, /已延期至第2站/)
  assert.match(v.summary, /随行保留/)
})

test('延期也须有理由，且可再次延期并记录每次理由', t => {
  const f = fixture(t)
  f.thread('side', '帮牧户修栅栏', { kind: '支线' })
  assert.throws(() => f.call('trpg_state', { op: 'deferThread', id: 'side' }), /理由/)
  f.call('trpg_state', { op: 'deferThread', id: 'side', reason: '先办主线' })
  f.move()
  const again = f.call('trpg_state', { op: 'deferThread', id: 'side', reason: '璃月手头事更急' })
  assert.equal(again.thread.deferredTo, 3)
  assert.equal(again.thread.deferrals.length, 2, '每次延期都要留下理由记录')
  assert.deepEqual(again.thread.deferrals.map(d => d.fromStation), [1, 2])
})

test('已关闭线索不能再次关闭或延期', t => {
  const f = fixture(t)
  f.thread('side', '帮牧户修栅栏', { kind: '支线' })
  f.call('trpg_state', { op: 'closeThread', id: 'side', resolution: '修好了' })
  assert.throws(() => f.call('trpg_state', { op: 'closeThread', id: 'side', resolution: '再关一次' }), /已关闭|已收束/)
  assert.throws(() => f.call('trpg_state', { op: 'deferThread', id: 'side', reason: 'x' }), /已关闭|已收束/)
})

test('closeThread 的 outcome 只接受 resolved/abandoned，且非法值不写档', t => {
  const f = fixture(t)
  f.thread('side', '帮牧户修栅栏', { kind: '支线' })
  const before = f.read()
  assert.throws(() => f.call('trpg_state', { op: 'closeThread', id: 'side', outcome: 'whatever', resolution: 'x' }), /resolved|abandoned/)
  assert.deepEqual(f.read(), before)
})

test('addThread 要求显式 kind，默认按支线记录', t => {
  const f = fixture(t)
  f.thread('a', '有分类的线索', { kind: '主线' })
  f.thread('b', '没写分类的线索')
  const s = f.read()
  assert.equal(s.world.threads.find(x => x.id === 'a').kind, '主线')
  assert.equal(s.world.threads.find(x => x.id === 'b').kind, '支线', '省略 kind 默认为支线')
  assert.throws(() => f.thread('c', '错分类', { kind: '关键' }), /主线|支线/)})

test('线程记录来源站点，延期后仍能追溯是从哪一站带出的', t => {
  const f = fixture(t)
  f.thread('side', '帮牧户修栅栏', { kind: '支线' })
  assert.equal(f.read().world.threads[0].originStation, 1)
  f.call('trpg_state', { op: 'deferThread', id: 'side', reason: '回蒙德再修' })
  f.move()
  assert.equal(f.read().world.threads[0].originStation, 1, '换站不改写既有线索的原始站点')
  assert.equal(f.view().threadList[0].originStation, 1)
})

test('threads 是只读查询，不得写入事件或改动存档', t => {
  const f = fixture(t)
  f.thread('side', '帮牧户修栅栏', { kind: '支线' })
  const journal = new Journal(f.root, 'solo', 'case')
  const before = { verify: journal.verify(), threads: structuredClone(f.read().world.threads) }
  f.view()
  f.view()
  const after = { verify: new Journal(f.root, 'solo', 'case').verify(), threads: f.read().world.threads }
  assert.deepEqual(after.verify, before.verify, '查看待处理清单不得新增事件')
  assert.deepEqual(after.threads, before.threads, '查看待处理清单不得改动线索')
})

test('旧档既有线程不被本轮改动自动关闭或改写', t => {
  const f = fixture(t)
  f.thread('keep_open', '保持原状的主线', { kind: '主线' })
  f.thread('keep_side', '保持原状的支线', { kind: '支线' })
  const journal = new Journal(f.root, 'solo', 'case')
  const before = structuredClone(journal.records().at(-1).after.world.threads)
  const v = f.view()
  assert.equal(v.threadList.length, 2)
  const after = f.read().world.threads
  assert.deepEqual(after, before, '仅查看待处理清单不得改动线程')
})
