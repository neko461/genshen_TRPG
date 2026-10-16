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
  assert.equal(result.gmMainline, fs.readFileSync(new URL('../../../主线规则.md', import.meta.url), 'utf8'))
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
