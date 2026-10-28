import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const source = path.join(root, 'character_setting', 'characters')
const target = fileURLToPath(new URL('../data/characters', import.meta.url))
const regions = [['mengde', '蒙德', 1], ['liyue', '璃月', 2], ['daoqi', '稻妻', 3], ['xumi', '须弥', 4], ['fengdan', '枫丹', 5], ['nata', '纳塔', 6], ['nuodekalai', '挪德卡莱', 8], ['zhidong', '至冬', 9]]
fs.mkdirSync(target, { recursive: true })
const index = []
for (const [key, region, station] of regions) {
  const jsonFile = path.join(source, `${key}.json`)
  // The first migration preserves every source byte. Later builds use JSON only.
  if (!fs.existsSync(jsonFile)) {
    const text = fs.readFileSync(path.join(source, `${key}.md`), 'utf8')
    const starts = [...text.matchAll(/^(?:(?:角色名|NPC\s*名)：[^\r\n]+|【[一二三四五六七八九十]+、[^\r\n]+】|【(?:跑团使用限制|阶段阅读规则|使用说明)[^\r\n]*】)[ \t]*\r?$/gm)].map(m => m.index)
    if (starts[0] !== 0) starts.unshift(0)
    let serial = 0
    const entries = starts.map((start, i) => {
      const body = text.slice(start, starts[i + 1] ?? text.length)
      const name = body.match(/^(?:角色名|NPC\s*名)：([^\r\n]+)/)?.[1].trim()
      if (!name) return { kind: 'context', text: body }
      const level = body.match(/【剧透等级】([^\r\n]+)/)?.[1].trim() ?? '隐藏'
      const short = name.split(/[·（(]/)[0].trim()
      return { kind: 'character', id: `${key}-${String(++serial).padStart(3, '0')}`, name,
        aliases: [...new Set([name, short])], level, text: body }
    })
    if (entries.map(e => e.text).join('') !== text) throw new Error(`迁移丢失正文：${key}`)
    fs.writeFileSync(jsonFile, JSON.stringify({ schemaVersion: 1, region, station, entries }, null, 2) + '\n')
  }
  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))
  if (doc.region !== region || doc.station !== station) throw new Error(`地区元数据不符：${key}`)
  const ids = new Set()
  for (const entry of doc.entries) {
    if (typeof entry.text !== 'string') throw new Error(`text必须是字符串：${key}`)
    if (entry.kind !== 'character') continue
    if (!/^[a-z]+-\d{3}$/.test(entry.id) || ids.has(entry.id) || !entry.name || !Array.isArray(entry.aliases)) throw new Error(`角色标识不合法或重复：${key}`)
    ids.add(entry.id)
    index.push({ id: entry.id, name: entry.name, aliases: entry.aliases, level: entry.level, region, station, file: `${key}.json` })
  }
  fs.writeFileSync(path.join(target, `${key}.json`), JSON.stringify(doc) + '\n')
  fs.writeFileSync(path.join(source, `${key}.md`), doc.entries.map(entry => entry.text).join(''))
}
if (new Set(index.map(e => e.id)).size !== index.length) throw new Error('跨地区id重复')
fs.writeFileSync(path.join(target, 'index.json'), JSON.stringify(index) + '\n')
console.log(`已同步${regions.length}个地区、${index.length}条角色；正文位于text，索引不含正文。`)
