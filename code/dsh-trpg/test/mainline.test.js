import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Runtime } from '../engine/runtime.js'
import { searchLore } from '../engine/lore.js'

test('无存档opening同时返回正式主线与主持资料，发布镜像保持一致', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-mainline-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const result = new Runtime({ root }).execute({ tool: 'trpg_char', mode: 'solo', slot: 'test', input: { op: 'opening' } })
  assert.equal(typeof result.gmMainline, 'string')
  assert.equal(result.gmMainline, fs.readFileSync(new URL('../../../docs/规则/主线规则.md', import.meta.url), 'utf8'))
  assert.match(result.gmInstructions, /关键场景对话自检（后台执行）/)
  assert.match(result.gmInstructions, /关键交流不能只把人物的话改写成线索报告/)
  assert.match(result.gmMainline, /状态：正式采用/)
  assert.match(result.creation.campaign, /亲历各国核心危机/)
  assert.match(result.creation.pacing, /400–700/)
  assert.equal(fs.existsSync(path.join(root, 'save')), false)
})

test('地区可见资料按危机未收束的进入状态返回，不提前公开后期结局', () => {
  const state = { settings: { spoiler_max: '剧情' }, timeline: { index: 1 }, world: { flags: {} } }
  for (const query of ['稻妻', '须弥', '枫丹', '纳塔']) assert.deepEqual(searchLore(state, { query }).hits, [])
  const entries = [
    [3, '稻妻', /锁国令限制往来/], [4, '须弥', /虚空终端广泛使用/],
    [5, '枫丹', /芙宁娜以水神身份公开活动/], [6, '纳塔', /危机尚未收束/],
  ]
  for (const [index, query, expected] of entries) {
    state.timeline.index = index
    const hits = searchLore(state, { query }).hits
    assert.equal(hits.length, 1)
    assert.match(hits[0].text, expected)
  }
  state.timeline.index = 9
  for (const query of ['血亲', '水神真相', '造神计划内幕']) assert.deepEqual(searchLore(state, { query }).hits, [])
})

test('短主持入口可在未建档时读取，不携带存档或无关未来资料', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-guidance-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const r = new Runtime({ root })
  const call = topic => r.execute({ tool: 'trpg_char', mode: 'solo', slot: 'test', input: { op: 'guidance', topic } })
  const mondstadt = call('mondstadt')
  assert.equal(mondstadt.audience, 'GM')
  assert.match(JSON.stringify(mondstadt), /旅行者与温迪救助特瓦林/)
  assert.doesNotMatch(JSON.stringify(mondstadt), /芙宁娜|米娜|枫丹|至冬/)
  assert.ok(mondstadt.sections[0].paragraphs.every(p => p.length < 2000))
  assert.match(JSON.stringify(call('mainline')), /未结识、未同行只限制队伍在场/)
  assert.match(JSON.stringify(call('continuity')), /观察到、推测、采集、携带、交给谁、鉴定/)
  const writing = call('writing')
  assert.equal(writing.audience, 'GM')
  assert.equal(writing.sections.length, 1)
  assert.match(JSON.stringify(writing), /关键交流不能只把人物的话改写成线索报告/)
  assert.match(JSON.stringify(writing), /行动范围、禁止事项、条件和停止点是本次行动授权的上限/)
  assert.match(JSON.stringify(writing), /检定卡的目的也必须与玩家授权一致/)
  assert.match(JSON.stringify(writing), /不强迫所有在场者轮流发言/)
  assert.match(JSON.stringify(writing), /普通问答、日常行动反馈，还是关键交流/)
  assert.match(JSON.stringify(writing), /若关键场景主要是/)
  assert.throws(() => call('../../秘密'), /topic/)
  assert.equal(fs.existsSync(path.join(root, 'save')), false)
})
