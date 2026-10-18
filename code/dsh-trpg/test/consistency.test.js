import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Runtime } from '../engine/runtime.js'
import { Journal } from '../engine/journal.js'

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-consistency-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const r = new Runtime({ root, d6Source: () => 4, random: () => 0, ...options })
  let n = 0
  const call = (tool, input = {}) => r.execute({ tool, mode: 'solo', slot: 'case', input, requestId: `c_${++n}` })
  const read = () => call('trpg_save', { op: 'load' }).state
  const recap = (limit = 5) => call('trpg_recap', { limit })
  return { root, r, call, read, recap }
}

// ---------------------------------------------------------------- 敌方元素反应

test('敌方元素攻击应触发元素反应并消耗附着，与玩家侧对称', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'demo' })
  f.call('trpg_scene', { op: 'open', goal: '元素反应探针', location: '林地' })
  f.call('trpg_combat', { op: 'start', enemies: [{ id: 'e', template: '铁甲熔火帝皇' }] })
  // 让敌人轮到自己行动
  let guard = 0
  while (f.read().battle.order[f.read().battle.cursor].id !== 'e' && guard++ < 8) {
    const s = f.read()
    f.call('trpg_combat_attack', { actor: s.battle.order[s.battle.cursor].id, target: 'e', action: 'attack' })
  }
  // 给玩家挂上「水」，模拟此前已被水元素命中；火敌人打上来应触发「蒸发 +20」
  const journal = new Journal(f.root, 'solo', 'case')
  const events = journal.records()
  const after = structuredClone(events.at(-1).after)
  after.revision = events.length + 1
  after.characters.pc.state.attached_element = '水'
  journal.appendRawForTest(after)
  const before = f.read()
  const hpBefore = before.characters.pc.state.hp
  const out = f.call('trpg_combat', { op: 'enemy' })
  const state = f.read()
  const pcEvents = (out.events ?? []).filter(e => e.target === 'pc')
  const reacted = pcEvents.find(e => e.reaction === '蒸发')
  assert.ok(reacted, `敌方火攻击命中带水附着的玩家应记录 蒸发，实际事件：${JSON.stringify(pcEvents)}`)
  assert.equal(reacted.reactionBonus, 20, '蒸发为增幅反应，固定 +20')
  // 旧实现在同场景固定骰面下总计只扣 38（群攻 18 + 单体 20，均无反应）。
  // 修复后首次命中即触发 蒸发：群攻 18 + 20 = 38，附着随反应消耗，单体回落为 20，合计 58。
  const totalDrop = hpBefore - state.characters.pc.state.hp
  assert.equal(totalDrop, 58, `命中应计入蒸发加成：旧实现 38，修复后 58，实测 ${totalDrop}`)
  assert.equal(pcEvents[0].damage, 38, '首次命中 18 + 蒸发 20 = 38')
  assert.equal(pcEvents.at(-1).damage, 20, '附着被反应消耗后，后续同元素攻击不再加成')
  assert.equal(state.characters.pc.state.attached_element, '火', '反应后附着被消耗并更新为攻击元素')
})

test('敌方攻击未命中不触发反应，也不消耗附着', t => {
  const f = fixture(t, { d6Source: () => 1 })
  f.call('trpg_save', { op: 'demo' })
  f.call('trpg_scene', { op: 'open', goal: '未命中探针', location: '林地' })
  f.call('trpg_combat', { op: 'start', enemies: [{ id: 'e', template: '铁甲熔火帝皇' }] })
  const journal = new Journal(f.root, 'solo', 'case')
  const events = journal.records()
  const after = structuredClone(events.at(-1).after)
  after.revision = events.length + 1
  after.characters.pc.state.attached_element = '水'
  journal.appendRawForTest(after)
  let guard = 0
  while (f.read().battle.order[f.read().battle.cursor].id !== 'e' && guard++ < 8) {
    const s = f.read()
    f.call('trpg_combat_attack', { actor: s.battle.order[s.battle.cursor].id, target: 'e', action: 'attack' })
  }
  const out = f.call('trpg_combat', { op: 'enemy' })
  for (const e of out.events ?? []) if (e.target === 'pc') assert.equal(e.reaction, null, '未命中不应记录反应')
  assert.equal(f.read().characters.pc.state.attached_element, '水', '未命中不消耗附着')
})

// ---------------------------------------------------------------- 场景目标与日期漂移

test('场景跨日后 recap 明确提示场景目标已滞后，不静默漂移', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'new' })
  f.call('trpg_char', { op: 'create', id: 'pc', name: '测试者' })
  f.call('trpg_scene', { op: 'open', goal: '第9日上午：在界石外等候约定的人', location: '风龙废墟外围' })
  assert.equal(f.call('trpg_recap', { limit: 3 }).sceneOpenDay, 1, '开场景时记录当时的战役日')
  assert.deepEqual(f.call('trpg_recap', { limit: 3 }).warnings, [], '同日不产生漂移提示')
  f.call('trpg_state', { op: 'set', day: 10, reason: '剧情已推进到第10日白天' })
  const r = f.call('trpg_recap', { limit: 3 })
  assert.equal(r.sceneOpenDay, 1)
  assert.equal(r.state.world.day, 10)
  const warning = r.warnings.find(w => w.kind === 'scene_day_drift')
  assert.ok(warning, `跨日后应提示场景目标滞后，实际：${JSON.stringify(r.warnings)}`)
  assert.match(warning.text, /关闭|重述|滞后/)
})

test('休整加日同样触发场景漂移提示，且不影响既有恢复结算', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'new' })
  f.call('trpg_char', { op: 'create', id: 'pc', name: '测试者' })
  f.call('trpg_scene', { op: 'open', goal: '在营地守夜', location: '营地', safe: true })
  f.call('trpg_recover', { level: '休整', reason: '在安全营地过夜' })
  const r = f.call('trpg_recap', { limit: 3 })
  assert.equal(r.state.world.day, 2)
  assert.ok(r.warnings.some(w => w.kind === 'scene_day_drift'), '休整跨日后应提示')
})

test('旧档没有 scene.openDay：从日志推导开局日，不误报也不漏报', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'demo' })
  f.call('trpg_scene', { op: 'open', goal: '旧档兼容探针', location: '车道' })
  // 模拟旧档：日志里 trpg_scene open 事件仍记录了当时的 world.day，但场景对象没有 openDay 字段
  const journal = new Journal(f.root, 'solo', 'case')
  const events = journal.records()
  const after = structuredClone(events.at(-1).after)
  after.revision = events.length + 1
  delete after.scene.openDay
  journal.appendRawForTest(after)
  // 同日：推导出 openDay=1，等于当前日，不提示
  const sameDay = f.call('trpg_recap', { limit: 3 })
  assert.equal(sameDay.sceneOpenDay, 1, '旧档应从 trpg_scene open 事件推导开局日')
  assert.deepEqual(sameDay.warnings, [], '同日不应误报漂移')
  // 跨日：推导出的开局日早于当前日，应提示（对应真实档 S21 目标写「第9日上午」而 day=10）
  f.call('trpg_state', { op: 'set', day: 4, reason: '剧情已推进到第4日' })
  const drifted = f.call('trpg_recap', { limit: 3 })
  const warning = drifted.warnings.find(w => w.kind === 'scene_day_drift')
  assert.ok(warning, `旧档跨日后应由推导值触发提示，实际：${JSON.stringify(drifted.warnings)}`)
  assert.equal(warning.openDay, 1)
  assert.equal(warning.day, 4)
})

// ---------------------------------------------------------------- 旅行者出场与登记

test('叙事已写旅行者当面出场但未登记时，narrate 返回可确证提示', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'new' })
  f.call('trpg_char', { op: 'create', id: 'pc', name: '测试者' })
  const out = f.call('trpg_narrate', { text: '来人只说自己被叫作“旅行者”，身后那个白色的小东西插了一句“派蒙”。' })
  const warning = (out.warnings ?? []).find(w => w.kind === 'traveler_met_unrecorded')
  assert.ok(warning, `应提示旅行者出场未登记，实际：${JSON.stringify(out)}`)
  // 提示是只读的：不擅自替玩家登记
  assert.deepEqual(f.call('trpg_party', { op: 'status' }).traveler, { met: false, joined: false, present: false })
})

test('旅行者提示只认引擎记录里出现的人名，不因普通叙事误报', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'new' })
  f.call('trpg_char', { op: 'create', id: 'pc', name: '测试者' })
  assert.deepEqual(f.call('trpg_narrate', { text: '城门值勤的骑士翻了翻登记簿，问他要找谁。' }).warnings ?? [], [], '未提人名不应提示')
  // 已登记后不再提示，且不影响正常结识流程
  f.call('trpg_party', { op: 'traveler', action: 'meet', reason: '玩家与他们在路口当面相见' })
  assert.deepEqual(f.call('trpg_narrate', { text: '旅行者点了点头。' }).warnings ?? [], [], '已登记不应重复提示')
})

test('固定试玩档已有旅行者角色卡时不误报未登记', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'demo' })
  assert.deepEqual(f.call('trpg_narrate', { text: '旅行者与派蒙就在旁边。' }).warnings ?? [], [], 'demo 档不应提示')
})

// ---------------------------------------------------------------- 章节完成与换站

test('有未收束事项时禁止换站，不能用换站带走未解决的核心线索', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'new' })
  f.call('trpg_char', { op: 'create', id: 'pc', name: '测试者' })
  // 主线关键线索未收束：阻止换站，且不能靠放弃或延期绕过
  f.call('trpg_state', { op: 'addThread', id: 'dragon_core', kind: '主线', text: '风龙危机的核心原因尚未查明' })
  const before = f.call('trpg_save', { op: 'load' }).state
  assert.throws(() => f.call('trpg_state', { op: 'nextStation', reason: '宣布蒙德篇结束' }), /关键主线未收束/)
  assert.deepEqual(f.call('trpg_save', { op: 'load' }).state, before, '被拒的换站不得写档')
  // 支线未处置同样拦换站，但允许完成/放弃/延期
  f.call('trpg_state', { op: 'addThread', id: 'side', kind: '支线', text: '帮牧户修栅栏' })
  assert.throws(() => f.call('trpg_state', { op: 'nextStation', reason: '想直接走' }), /关键主线未收束/)
  // 按事实完成主线、处置支线后可以换站
  f.call('trpg_state', { op: 'closeThread', id: 'dragon_core', outcome: 'resolved', resolution: '风龙危机已实际解决' })
  assert.throws(() => f.call('trpg_state', { op: 'nextStation', reason: '想直接走' }), /支线未处置/)
  f.call('trpg_state', { op: 'deferThread', id: 'side', reason: '玩家选择先离开，回来再修' })
  const moved = f.call('trpg_state', { op: 'nextStation', reason: '风龙危机已实际解决并交代余波' })
  assert.equal(moved.timeline.index, 2)
})

test('正文宣告篇章结束时提示核对核心危机，不把原创善后当成整章完成', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'new' })
  f.call('trpg_char', { op: 'create', id: 'pc', name: '测试者' })
  f.call('trpg_state', { op: 'addThread', id: 'dragon_core', text: '特瓦林与深渊干预尚未处理' })
  const out = f.call('trpg_narrate', { text: '风势转向上扬，城市层面的异常停止。就这样，蒙德篇结束了。' })
  const warning = (out.warnings ?? []).find(w => w.kind === 'chapter_completion_claim')
  assert.ok(warning, `宣告篇章结束须提示核对主线，实际：${JSON.stringify(out.warnings)}`)
  assert.deepEqual(warning.openThreads, ['dragon_core'], '提示应列出未收束事项')
  assert.equal(warning.station, '蒙德')
  assert.match(warning.text, /核心危机|核心事件/)
})

test('普通叙事提到结束或章节不误报', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'new' })
  f.call('trpg_char', { op: 'create', id: 'pc', name: '测试者' })
  for (const text of ['这桩委托结束了，他把绳子收好。', '她翻到书的第三章，读到最后一段。', '一天的巡查到此结束。']) {
    assert.deepEqual(f.call('trpg_narrate', { text }).warnings ?? [], [], `不应误报：${text}`)
  }
})

// ---------------------------------------------------------------- 长日志性能

test('长日志下重复读取复用已校验前缀，且完整性校验仍有效', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'new' })
  f.call('trpg_char', { op: 'create', id: 'pc', name: '测试者' })
  for (let i = 0; i < 120; i += 1) f.call('trpg_narrate', { text: `第${i}段叙事，用于压测长战役日志。`.repeat(6) })
  const journal = new Journal(f.root, 'solo', 'case')
  assert.equal(journal.records().length, 122)
  // 缺陷复现：旧实现在同一实例上每次 records() 都重读并重验整份日志（recap 一次调用 3 遍）。
  const started = process.hrtime.bigint()
  for (let i = 0; i < 20; i += 1) journal.records()
  const perCall = Number(process.hrtime.bigint() - started) / 1e6 / 20
  assert.ok(perCall < 5, `已校验前缀应被复用，实测每次 ${perCall.toFixed(3)}ms`)
  assert.equal(journal.verify().valid, true, '缓存不得削弱完整性校验')
  assert.equal(journal.verify().events, 122)
})

test('日志被外部改写时缓存立即失效并整体重验', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'new' })
  f.call('trpg_char', { op: 'create', id: 'pc', name: '测试者' })
  const journal = new Journal(f.root, 'solo', 'case')
  assert.equal(journal.records().length, 2)
  // 篡改已校验前缀中的一条事件，缓存必须被丢弃并报错，而不是继续返回旧内容
  const file = path.join(f.root, 'save', 'slots', 'solo', 'case', 'journal.jsonl')
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
  const tampered = JSON.parse(lines[1])
  tampered.after.world.day = 999
  lines[1] = JSON.stringify(tampered)
  fs.writeFileSync(file, lines.join('\n') + '\n')
  assert.throws(() => journal.records(), /已校验前缀被改写/)
  // 换一个实例（无缓存）读到的是被篡改的内容，必须按校验链报错，而不是静默接受
  assert.throws(() => new Journal(f.root, 'solo', 'case').records(), /校验失败/)
})

test('追加写入后缓存失效，新事件可立即读到', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'new' })
  f.call('trpg_char', { op: 'create', id: 'pc', name: '测试者' })
  const journal = new Journal(f.root, 'solo', 'case')
  assert.equal(journal.records().length, 2)
  f.call('trpg_narrate', { text: '缓存失效探针' })
  assert.equal(journal.records().length, 3, '同一实例追加后必须读到新事件')
  assert.equal(journal.load().notes.at(-1), '缓存失效探针')
})
