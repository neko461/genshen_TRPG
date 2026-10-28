import fs from 'node:fs'

const gmURL = new URL('../prompt/gm-system.md', import.meta.url)
const mainURL = new URL('../prompt/mainline-rules.md', import.meta.url)
const coreURL = new URL('../prompt/gm-core.md', import.meta.url)
const manifest = JSON.parse(fs.readFileSync(new URL('../data/guidance-manifest.json', import.meta.url), 'utf8'))

// These two partitions include every byte of the authoritative sources. IDs are
// independent of line numbers; a new source heading must update this manifest.
export function guidanceSections() {
  const gm = fs.readFileSync(gmURL, 'utf8')
  const main = fs.readFileSync(mainURL, 'utf8')
  const partition = (source, text, pattern) => {
    const definitions = manifest.filter(section => section.source === source)
    const starts = [...text.matchAll(pattern)].map(match => match.index)
    if (starts[0] !== 0) starts.unshift(0)
    if (starts.length !== definitions.length) throw new Error(`主持资料${source}章节结构变化，请更新固定ID映射`)
    return starts.map((start, index) => {
      const textPart = text.slice(start, starts[index + 1] ?? text.length)
      if (textPart.match(/^#{1,3} (.+)/m)?.[1] !== definitions[index].heading) throw new Error(`主持资料固定章节变更：${definitions[index].id}`)
      return { id: definitions[index].id, source, text: textPart }
    })
  }
  return [
    ...partition('gm', gm, /^# /gm),
    ...partition('mainline', main, /^## /gm),
  ]
}

const excludeLegacy = text => text.split(/\r?\n\s*\r?\n/).filter(p => !/adventure_01|米娜/.test(p)).join('\n\n')
const sectionResult = (id, text) => ({ id, heading: text.match(/^#{1,3} (.+)/m)?.[1] ?? id, paragraphs: text.trim().split(/\r?\n\s*\r?\n/) })

function subsection(sections, id, heading) {
  const source = sections.find(section => section.id === id)?.text
  const marker = `### ${heading}`
  const start = source?.indexOf(marker) ?? -1
  if (start < 0) throw new Error(`主持资料固定章节缺失：${id}/${heading}`)
  return source.slice(start).split(/\r?\n#{1,3} /, 1)[0]
}

function chapterText(sections, station) {
  const text = sections.find(section => section.id === 'mainline.chapters').text
  const row = text.split(/\r?\n/).find(line => line.startsWith(`| ${station}（`))
  if (!row) throw new Error('当前站点没有对应章节，请核对station')
  const header = text.split(/\r?\n/).find(line => line.startsWith('| 地区'))
  const chapter = `${header ?? '| 地区 | 进入状态 | 参与方向 | 收束依据 |'}\n${row}`
  return station === '蒙德' ? `${chapter}\n\n${subsection(sections, 'mainline.chapters', '蒙德关键进程与原创调查的边界')}\n\n${subsection(sections, 'mainline.chapters', '不依赖旅行者入队的参与路径')}` : chapter
}

export function readGuidance(input, { slot, station = '蒙德' } = {}) {
  const sections = guidanceSections()
  const topic = input.topic
  let selected
  if (input.sectionId) {
    const found = sections.find(section => section.id === input.sectionId)
    if (!found) throw new Error('未知sectionId；请先guidance topic:catalog读取固定ID')
    if (found.id === 'mainline.legacy' && slot !== 'adventure_01') throw new Error('旧槽位特例仅适用于adventure_01')
    selected = [{ ...found, text: slot === 'adventure_01' ? found.text : excludeLegacy(found.text) }]
  } else if (topic === 'catalog') {
    return { audience: 'GM', topic, sections: sections.map(({ id, text }) => ({ id, heading: text.match(/^#{1,3} (.+)/m)?.[1] ?? id })),
      topics: ['core', 'mainline', 'chapter', 'mondstadt', 'continuity', 'writing', 'writing-full', 'geography', 'difficulty', 'companions', 'creation', 'legacy'] }
  } else if (topic === 'core') selected = [{ id: 'core', text: fs.readFileSync(coreURL, 'utf8') }]
  else if (topic === 'mainline') selected = sections.filter(s => ['mainline.intro', 'mainline.causality', 'mainline.direction', 'mainline.play', 'mainline.growth'].includes(s.id))
  else if (topic === 'chapter') selected = [{ id: `chapter.${station}`, text: chapterText(sections, station) }]
  else if (topic === 'mondstadt') selected = [{ id: 'chapter.mondstadt', text: subsection(sections, 'mainline.chapters', '蒙德关键进程与原创调查的边界') }]
  else if (topic === 'continuity') selected = sections.filter(s => s.id === 'mainline.continuity')
  else if (topic === 'writing') selected = [{ id: 'writing.check', text: subsection(sections, 'gm.hosting', '关键场景对话自检（后台执行）') }]
  else if (['writing-full', 'geography', 'difficulty', 'companions'].includes(topic)) selected = sections.filter(s => s.id === `gm.${topic}`)
  else if (topic === 'creation') {
    const text = sections.find(s => s.id === 'gm.hosting').text
    selected = [{ id: 'creation', text: text.slice(text.indexOf('## 零基础引导'), text.indexOf('## 开局与每轮')) }]
  } else if (topic === 'legacy' && slot === 'adventure_01') {
    selected = [{ id: 'legacy.adventure-01', text: sections.map(s => s.text).join('\n').split(/\r?\n\s*\r?\n/).filter(p => /adventure_01|米娜/.test(p)).join('\n\n') }]
  } else throw new Error('guidance topic无效或旧槽位特例不适用于本档；请查询catalog')
  return { audience: 'GM', topic: topic ?? input.sectionId, sections: selected.map(({ id, text }) => sectionResult(id, slot === 'adventure_01' || topic === 'legacy' ? text : excludeLegacy(text))) }
}

export function stagedOpening(station, slot) {
  const chapter = readGuidance({ topic: 'chapter' }, { station, slot })
  return {
    gmInstructions: fs.readFileSync(coreURL, 'utf8'),
    gmMainline: chapter.sections.flatMap(section => section.paragraphs).join('\n\n'),
    guidancePlan: {
      profile: 'staged-v1', chapter: station,
      beforeCreation: 'creation', beforeCombat: ['difficulty', 'companions'], beforeRoute: 'geography',
      beforeKeyDialogue: ['writing', 'companions'], beforeChapterClosure: ['mainline', 'continuity', 'chapter'],
      rulesOnDemand: { creation: 'creation', checks: 'checks', combat: 'combat', equipment: 'equipment', recovery: 'recovery' },
      beforeNPC: 'trpg_char profile(query:角色名)，多义时search再profile(id)；只读取当前需要扮演者的text，不加载全体角色。',
      reuse: '已读取且仍在当前上下文中的相同规则可沿用，不逐回合重复加载；主题缺失或不确定才补读。',
      recovery: '上下文压缩或规则不确定时按topic重读；profile:full可完整读取两份原始主持资料。',
      ...(slot === 'adventure_01' ? { slotSpecific: 'legacy' } : {}),
    },
  }
}
