import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { guidanceSections, readGuidance } from '../engine/guidance.js'
import { Runtime } from '../engine/runtime.js'
import { createTools } from '../lib/tools.js'
import { STATIONS } from '../engine/campaign.js'

test('固定章节映射逐字覆盖两份权威提示词，发布镜像不丢段', () => {
  const sections = guidanceSections()
  assert.equal(new Set(sections.map(section => section.id)).size, sections.length)
  for (const [source, file] of [['gm', 'gm-system'], ['mainline', 'mainline-rules']]) {
    assert.equal(sections.filter(section => section.source === source).map(section => section.text).join(''), fs.readFileSync(new URL(`../prompt/${file}.md`, import.meta.url), 'utf8'))
  }
  for (const section of sections) {
    const output = readGuidance({ sectionId: section.id }, { slot: 'adventure_01' })
    assert.equal(output.sections[0].paragraphs.join('\n\n').replace(/\r\n/g, '\n'), section.text.trim().replace(/\r\n/g, '\n').replace(/\n\s*\n/g, '\n\n'))
  }
})

test('主线入口覆盖节奏/调查/自由行动，地区入口按站点隔离未来与旧档', () => {
  const mainline = JSON.stringify(readGuidance({ topic: 'mainline' }, { slot: 'new_case' }))
  assert.match(mainline, /主线节奏/)
  assert.match(mainline, /主线调查的揭示与支线纵深/)
  assert.match(mainline, /任务设计的三个底线/)
  assert.doesNotMatch(mainline, /adventure_01|米娜/)
  for (const station of STATIONS) {
    const chapter = JSON.stringify(readGuidance({ topic: 'chapter' }, { station, slot: 'new_case' }))
    assert.ok(chapter.includes(station))
    if (station === '蒙德') {
      assert.match(chapter, /净化/)
      assert.match(chapter, /不依赖旅行者入队/)
      assert.doesNotMatch(chapter, /芙宁娜|玛薇卡|米娜|须弥/)
    }
  }
  assert.throws(() => readGuidance({ topic: 'legacy' }, { slot: 'new_case' }), /topic/)
  assert.throws(() => readGuidance({ sectionId: 'mainline.legacy' }, { slot: 'new_case' }), /旧槽位/)
  assert.match(JSON.stringify(readGuidance({ topic: 'legacy' }, { slot: 'adventure_01' })), /米娜/)
  assert.throws(() => readGuidance({ topic: '../../hidden' }), /topic/)
})

test('DSH默认分层开场，完整接口仍兼容；阶段查询不会新建或移动存档', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-guidance-v2-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const tool = createTools({ root }).find(tool => tool.name === 'trpg_char')
  const base = { mode: 'solo', slot: 'case', input: { op: 'opening' } }
  const staged = tool.execute(base)
  const full = tool.execute({ ...base, input: { op: 'opening', profile: 'full' } })
  assert.ok(JSON.stringify(staged).length < JSON.stringify(full).length / 3)
  assert.equal(full.gmInstructions, fs.readFileSync(new URL('../prompt/gm-system.md', import.meta.url), 'utf8'))
  assert.equal(full.gmMainline, fs.readFileSync(new URL('../prompt/mainline-rules.md', import.meta.url), 'utf8'))
  assert.match(staged.gmInstructions, /400–700/)
  assert.match(staged.gmInstructions, /两项有依据的优势/)
  assert.match(staged.gmInstructions, /公平裁定/)
  assert.match(staged.gmMainline, /净化/)
  const selected = tool.execute({ ...base, input: { op: 'opening', startStation: '璃月' } })
  assert.match(selected.gmMainline, /请仙典仪/)
  assert.doesNotMatch(selected.gmMainline, /特瓦林|芙宁娜/)
  assert.deepEqual(fs.readdirSync(root), [])
  const runtime = new Runtime({ root })
  runtime.execute({ tool: 'trpg_save', mode: 'solo', slot: 'case', input: { op: 'new', startStation: '璃月' } })
  const request = { tool: 'trpg_char', mode: 'solo', slot: 'case', input: { op: 'guidance', topic: 'chapter' } }
  assert.match(JSON.stringify(runtime.execute(request)), /请仙典仪/)
  const loaded = runtime.execute({ ...request, tool: 'trpg_save', input: { op: 'load' } })
  assert.equal(loaded.state.revision, 1)
})
