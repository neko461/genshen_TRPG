/** 精简运行名录。名称是战役模板，不是原游戏数值的复刻。 */
export const ENCOUNTER_COST = Object.freeze({ 1: 1, 2: 2, 3: 4 })
export const ENCOUNTER_BUDGET = 4

const rows = [
  ['丘丘人', 1, null, '普通'],
  ['丘丘射手', 1, null, '远程'],
  ['史莱姆', 1, null, '元素'],
  ['盗宝团斥候', 1, null, '普通'],
  ['盗宝团药剂师', 1, null, '元素'],
  ['野伏众', 1, null, '普通'],
  ['蕈兽', 1, '草', '元素'],
  ['丘丘暴徒', 2, null, '蓄力'],
  ['愚人众先遣队', 2, null, '护甲'],
  ['镀金旅团术士', 2, null, '召唤'],
  ['发条机关', 2, null, '核心'],
  ['狂猎幽徒', 2, null, '锚点'],
  ['妖精戍卫', 2, '冰', '护甲'],
  ['急冻树', 3, '冰', '核心'],
  ['无相之雷', 3, '雷', '核心'],
  ['古岩龙蜥', 3, '岩', '蓄力'],
  ['魔偶剑鬼', 3, null, '蓄力'],
  ['翠翎恐蕈', 3, '草', '蓄力'],
  ['铁甲熔火帝皇', 3, '火', '护甲'],
  ['金焰绒翼龙暴君', 3, '火', '核心'],
  ['重拳出击鸭', 3, null, '召唤'],
  ['图帕尧的协辅', 3, '火', '蓄力'],
  ['望乡的孤狼', 3, null, '锚点'],
  ['西格德', 3, null, '召唤'],
]

export const ENEMY_ROSTER = Object.freeze(Object.fromEntries(rows.map(([name, threat, element, mechanic]) => [
  name, Object.freeze({ name, threat, element, mechanic }),
])))

export function listEnemies() {
  return Object.values(ENEMY_ROSTER).map((e) => ({ ...e, cost: ENCOUNTER_COST[e.threat] }))
}

/** 已归并的名称可以使用；历史/停用首领不自动套用。 */
const aliases = Object.freeze({
  '盗宝团·斥候': '盗宝团斥候',
  '盗宝团·火之药剂师': '盗宝团药剂师',
  '盗宝团·雷之药剂师': '盗宝团药剂师',
  '盗宝团·水之药剂师': '盗宝团药剂师',
  '盗宝团·冰之药剂师': '盗宝团药剂师',
  '野伏·阵刀番': '野伏众',
  '荒野幽徒': '狂猎幽徒',
  '历经百战的执灯人': '西格德',
})

export function resolveEnemy(input) {
  if (!input || typeof input !== 'object') throw new Error('resolveEnemy: 敌人必须是对象')
  const key = input.template ?? aliases[input.name] ?? input.name
  const def = ENEMY_ROSTER[key]
  if (input.template !== undefined && def === undefined) throw new Error(`未知敌人模板「${input.template}」`)
  if (def === undefined && input.threat === undefined) throw new Error('敌人必须指定已启用模板或显式 threat')
  if (def !== undefined && input.threat !== undefined && input.threat !== def.threat) {
    throw new Error(`敌人模板「${key}」的威胁等级为 ${def.threat}，不能另传 ${input.threat}`)
  }
  const threat = def?.threat ?? input.threat
  if (!Number.isInteger(threat) || !Object.hasOwn(ENCOUNTER_COST, threat)) throw new Error('敌人威胁必须为 1、2 或 3')
  const element = input.element ?? def?.element ?? null
  if (element !== null && !['风', '岩', '雷', '草', '水', '火', '冰'].includes(element)) {
    throw new Error('敌人元素必须是已知七元素之一；月矩力仅为能源描述')
  }
  return {
    ...input,
    name: input.name ?? def?.name,
    template: def?.name ?? null,
    threat,
    element,
    mechanic: def?.mechanic ?? '普通',
  }
}

/** 限制整场预算，避免每个敌人都按完整首领预算叠加。 */
export const ENCOUNTER_LIMITS = Object.freeze({
  standard: Object.freeze({ budget: 4, maxUnits: 4 }),
  independent: Object.freeze({ budget: 2, maxUnits: 2, soloBossRules: true, allowBossOnly: true }),
  accompanied: Object.freeze({ budget: 3, maxUnits: 3, soloBossRules: true, allowBossOnly: true }),
})

export function validateEncounter(enemies, { budget = ENCOUNTER_BUDGET, maxUnits = 4, soloBossRules = false, allowBossOnly = false } = {}) {
  if (!Array.isArray(enemies) || enemies.length === 0) throw new Error('遭遇至少需要 1 个敌人单位')
  if (enemies.length > maxUnits) throw new Error(`本场遭遇最多 ${maxUnits} 个独立单位；更多敌人须作为背景威胁或分批登场`)
  const bossOnly = soloBossRules && allowBossOnly && enemies.length === 1 && enemies[0].threat === 3
  if (soloBossRules && enemies.some((enemy) => enemy.threat === 3) && !bossOnly) throw new Error('独行首领遭遇须为唯一敌方单位，不能额外附带其他敌人')
  const cost = enemies.reduce((sum, enemy) => sum + ENCOUNTER_COST[enemy.threat], 0)
  const effectiveBudget = bossOnly ? ENCOUNTER_COST[3] : budget
  if (!Number.isFinite(cost) || cost > effectiveBudget) throw new Error(`遭遇超出 ${effectiveBudget} 点预算：杂兵 1、劲敌 2、首领 4`)
  return { cost, budget: effectiveBudget }
}
