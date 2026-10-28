import fs from 'node:fs'
const INDEX = JSON.parse(fs.readFileSync(new URL('../data/lore.json', import.meta.url), 'utf8'))

/** 只返回人工批准的玩家可见索引；不扫描 GM 原稿，未知内容默认拒绝。 */
export function searchLore(state, input) {
  if (input.file !== undefined) throw new Error('v0.01 不支持任意文件检索；仅查询已审核的玩家可见索引')
  const level = input.spoilerMax ?? '剧情'
  if (!['公开', '剧情'].includes(level)) throw new Error('不能通过请求提升到隐藏或禁止级')
  const query = String(input.query ?? '').trim()
  if (!query || query.length > 80) throw new Error('检索词须为 1–80 字')
  const max = state.settings.spoiler_max === '公开' ? '公开' : level
  const hits = INDEX.filter((e) => e.station <= state.timeline.index && (e.level === '公开' || (max === '剧情' && e.unlock && state.world.flags[e.unlock] === true)))
    .filter((e) => e.keys.some((k) => k.includes(query) || query.includes(k))).slice(0, 10)
    .map(({ id, text, level }) => ({ id, text, level }))
  return { hits, notice: hits.length ? '仅含当前阶段已审核内容。' : '当前没有已解锁且可公开的资料；请通过剧情寻找线索，不推断受限正文。' }
}
