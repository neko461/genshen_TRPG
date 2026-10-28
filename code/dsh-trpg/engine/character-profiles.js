import fs from 'node:fs'

const base = new URL('../data/characters/', import.meta.url)
const index = JSON.parse(fs.readFileSync(new URL('index.json', base), 'utf8'))
const forbidden = entry => entry.level.startsWith('禁止')
export function characterProfiles(input, station) {
  if (input.file !== undefined || input.path !== undefined) throw new Error('角色读取不接受文件路径')
  const query = typeof input.query === 'string' ? input.query.trim() : ''
  if (input.id !== undefined && (typeof input.id !== 'string' || !/^[a-z]+-\d{3}$/.test(input.id))) throw new Error('角色id不合法')
  if (!input.id && (typeof query !== 'string' || !query || query.length > 80)) throw new Error('角色检索词须为1–80字')
  const limit = input.limit ?? 5
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('limit须为1–10')
  const matches = index.filter(e => e.station <= station && !forbidden(e) && (!input.region || e.region === input.region))
    .filter(e => input.id ? e.id === input.id : e.name.includes(query) || e.aliases.some(alias => alias.includes(query)))
    .sort((a, b) => Number(b.aliases.includes(query)) - Number(a.aliases.includes(query)))
  const notice = '仅供GM扮演参考，不代表在场、入队或已解锁秘密。原项目资料未经本次迁移核实正史；后期状态须按本档实际事件启用，不将全文朗读给玩家。'
  if (input.op === 'search') return { audience: 'GM', matches: matches.slice(0, limit).map(({ file, station, ...metadata }) => metadata), total: matches.length, notice }
  if (matches.length !== 1 && !(matches.length && matches[0].aliases.includes(query) && !matches[1]?.aliases.includes(query))) {
    return { audience: 'GM', matches: matches.slice(0, limit).map(({ file, station, ...metadata }) => metadata), notice: matches.length ? '存在多个角色，请用搜索结果的id读取，不拼接同名人物。' : '未找到当前阶段可读取的角色；不会生成或返回受限正文。' }
  }
  const match = matches[0]
  const doc = JSON.parse(fs.readFileSync(new URL(match.file, base), 'utf8'))
  const entry = doc.entries.find(e => e.id === match.id)
  if (!entry || typeof entry.text !== 'string') throw new Error('角色索引与正文不同步，请重建角色数据')
  return { audience: 'GM', character: { id: entry.id, name: entry.name, region: doc.region, level: entry.level, text: entry.text }, notice }
}
