/**
 * 装备：武器与圣遗物。
 *
 * 对应 `finalized-stat-rules-v1.0.md` 第五、六节与 `world_setting/weapon_setting.md`。
 *
 * 设计要点：
 * - 圣遗物 **3 槽位**（生之花 / 死之羽 / 理之冠），**2件套 / 3件套**。
 * - 单件加成**固定**（无随机词条），差异只来自**品质**与**套装**。
 * - 强化**有上限**（★不可强化 → ★★★★★ 可 +4），**无失败风险**。
 * - ★★★★ 以上**不可购买**，只能通过遗迹（递进检定链）或馈赠（关系门槛）。
 */

import {
  ARTIFACT_HP_BONUS,
  ARTIFACT_SLOTS,
  ARTIFACT_SLOT_BASE,
  ARTIFACT_UPGRADE_CAP,
  ARTIFACT_UPGRADE_STEP,
  ARTIFACT_SET_MIN_QUALITY,
  ARTIFACT_SET_THRESHOLD,
  QUALITY_LABEL,
  WEAPONS,
  WEAPON_TRAIT_MIN_QUALITY,
  resolveWeapon,
} from './rules.js'

export { ARTIFACT_SLOTS }

/**
 * 套装定义表。
 *
 * 每条含：
 * - `slot3`：理之冠槽位的固定加成
 * - `two`：2件套效果（从 ★★★ 起生效）
 * - `three`：3件套效果（从 ★★★★ 起生效）
 *
 * 当前生命加值按本团战斗尺度统一压缩；单件生之花基础 +10 HP。
 */
export const ARTIFACT_SETS = Object.freeze({
  冒险家: Object.freeze({
    slot3: { hp: ARTIFACT_HP_BONUS },
    two: `生命值上限提升 ${ARTIFACT_HP_BONUS} 点`,
    three: '实际获得宝箱奖励后恢复 30% 已损失 HP；每场景一次，同一宝箱不重复触发',
  }),
  幸运儿: Object.freeze({
    slot3: { reduction: 10 },
    two: '伤害减免 +10',
    three: '实际完成报酬结算后恢复 10 点 HP；每场景一次，搬运摩拉不触发',
  }),
  游医: Object.freeze({
    slot3: { healingBonus: 0.2 },
    two: '受到的治疗效果提高 20%',
    three: '实际消耗能量使用元素技后，恢复 20% 已损失 HP',
  }),
  学士: Object.freeze({
    slot3: { reactionBonus: 15 },
    two: '元素反应加成 +15',
    three: '每场战斗一次，元素技不消耗能量',
  }),
  战狂: Object.freeze({
    slot3: { damage: 10 },
    two: '伤害 +10',
    three: 'HP 低于 50% 时，伤害 +20',
  }),
  流放者: Object.freeze({
    slot3: { energyMax: 1 },
    two: '元素能量上限 +1',
    three: '每场战斗一次，可为队友恢复 1 点能量',
  }),
  角斗士的终幕礼: Object.freeze({
    slot3: { damage: 15 },
    two: '伤害 +15',
    three: '本轮未移动时伤害 +20；大成功时额外造成 30 点伤害',
  }),
  追忆之注连: Object.freeze({
    slot3: { hp: ARTIFACT_HP_BONUS },
    two: `生命值上限提升 ${ARTIFACT_HP_BONUS} 点`,
    three: '每场战斗首次被命中时，额外减伤 15；未命中不消耗',
  }),
  翠绿之影: Object.freeze({
    slot3: { reactionBonus: 15 },
    two: '元素反应加成 +15',
    three: '每场战斗一次可无视附着状态直接触发反应；持续伤害延长至 3 轮',
  }),
  如雷的盛怒: Object.freeze({
    slot3: { initiative: 2 },
    two: '先攻 +2',
    three: '战斗第一轮可行动两次（第二次伤害减半）',
  }),
  悠古的磐岩: Object.freeze({
    slot3: { threat: 0.5 },
    two: '仇恨权重 +0.5',
    three: '每场战斗一次，可将对友方的一次伤害转移给自己（转移后 −10）',
  }),
  沉沦之心: Object.freeze({
    slot3: { hp: ARTIFACT_HP_BONUS },
    two: '每场战斗结束恢复 15 点 HP',
    three: '元素能量上限 +1；每场战斗一次元素技不消耗能量',
  }),
})

/** 套装名列表。 */
export const ARTIFACT_SET_NAMES = Object.freeze(Object.keys(ARTIFACT_SETS))

/**
 * 制造一件圣遗物。
 *
 * @param {object} input
 * @param {string} input.set - 套装名。
 * @param {keyof ARTIFACT_SLOTS} input.slot - 槽位。
 * @param {number} input.quality - 品质 1..5。
 * @param {number} [input.upgrade] - 强化等级（受品质上限约束）。
 * @returns {object} 圣遗物对象。
 */
export function makeArtifact(input) {
  const setDef = ARTIFACT_SETS[input.set]
  if (setDef === undefined) {
    throw new Error(`makeArtifact: 未知套装「${input.set}」。可用：${ARTIFACT_SET_NAMES.join('、')}`)
  }
  if (!ARTIFACT_SLOTS.includes(input.slot)) {
    throw new Error(`makeArtifact: 槽位必须是 ${ARTIFACT_SLOTS.join('/')}，收到 ${input.slot}`)
  }
  assertQuality(input.quality)
  const cap = ARTIFACT_UPGRADE_CAP[input.quality]
  const upgrade = input.upgrade ?? 0
  if (!Number.isInteger(upgrade) || upgrade < 0 || upgrade > cap) {
    throw new Error(`makeArtifact: 品质 ${input.quality}（${QUALITY_LABEL[input.quality]}）的强化上限是 +${cap}，收到 +${upgrade}`)
  }
  return { set: input.set, slot: input.slot, quality: input.quality, upgrade }
}

/**
 * 算出一件圣遗物的实际加成（含强化）。
 *
 * @param {object} artifact - 圣遗物对象。
 * @returns {Record<string, number>} 加成映射，如 `{ hp: 60 }`。
 */
export function artifactBonus(artifact) {
  const setDef = ARTIFACT_SETS[artifact.set]
  if (setDef === undefined) throw new Error(`artifactBonus: 未知套装「${artifact.set}」`)
  if (artifact.quality === 1) return {}
  const slotBase = ARTIFACT_SLOT_BASE[artifact.slot] ?? {}
  const fromSet = artifact.slot === '理之冠' ? (setDef.slot3 ?? {}) : {}
  const base = { ...slotBase, ...fromSet }

  const upgrade = artifact.upgrade ?? 0
  // 未强化时**原样返回基础值**——否则像先攻 +2、仇恨 +0.5 这类小数值会被量化抹平。
  if (upgrade === 0) return { ...base }

  const multiplier = 1 + upgrade * ARTIFACT_UPGRADE_STEP
  const out = {}
  for (const [key, value] of Object.entries(base)) {
    // 先攻、权重、能量和比例不适用伤害的量化，也不参与强化。
    out[key] = ['hp', 'damage', 'reduction', 'reactionBonus'].includes(key)
      ? Math.ceil(value * multiplier / 5) * 5
      : value
  }
  return out
}

/**
 * 汇总一整套圣遗物的加成与生效的套效。
 *
 * @param {Array<object|null>} artifacts - 最多 3 件（按 ARTIFACT_SLOTS 顺序或任意顺序）。
 * @returns {{
 *   totals: Record<string, number>,
 *   setCounts: Record<string, number>,
 *   activeTwo: string|null,
 *   activeThree: string|null,
 *   setEffects: string[],
 *   warnings: string[]
 * }}
 */
export function resolveArtifactSet(artifacts) {
  const worn = (artifacts ?? []).filter((a) => a !== null && a !== undefined)
  const warnings = []
  if (worn.length > ARTIFACT_SLOTS.length) {
    warnings.push(`最多装备 ${ARTIFACT_SLOTS.length} 件圣遗物，收到 ${worn.length} 件；超出部分被忽略`)
  }
  const used = worn.slice(0, ARTIFACT_SLOTS.length)

  // 槽位唯一性
  const seen = new Set()
  for (const a of used) {
    if (seen.has(a.slot)) {
      throw new Error(`resolveArtifactSet: 槽位「${a.slot}」被重复装备`)
    }
    seen.add(a.slot)
  }

  const totals = {}
  for (const a of used) {
    const b = artifactBonus(a)
    for (const [k, v] of Object.entries(b)) totals[k] = (totals[k] ?? 0) + v
  }

  const setCounts = {}
  for (const a of used) setCounts[a.set] = (setCounts[a.set] ?? 0) + 1

  // 套效生效：某套装达到 2 件 / 3 件，且**该套装中参与计数的圣遗物最低品质**达标
  const activeTwo = findActiveSet(used, setCounts, ARTIFACT_SET_THRESHOLD.two, ARTIFACT_SET_MIN_QUALITY.two)
  const activeThree = findActiveSet(used, setCounts, ARTIFACT_SET_THRESHOLD.three, ARTIFACT_SET_MIN_QUALITY.three)

  const setEffects = []
  if (activeTwo !== null) {
    setEffects.push(`2件套（${activeTwo}）：${ARTIFACT_SETS[activeTwo].two}`)
  }
  if (activeThree !== null) {
    setEffects.push(`3件套（${activeThree}）：${ARTIFACT_SETS[activeThree].three}`)
  }

  return { totals, setCounts, activeTwo, activeThree, setEffects, warnings }
}

/**
 * 校验强化是否合法并返回强化后的新对象。
 *
 * **无失败风险**——不做赌强化。但 **+4 满级需要一件同套装的同名圣遗物**作为材料，
 * 因此调用方需先确认材料已消耗。
 *
 * @param {object} artifact - 圣遗物对象。
 * @param {boolean} hasSameSetMaterial - 是否已提供同套装材料（升到 +4 必需）。
 * @returns {{ ok: true, artifact: object } | { ok: false, reason: string }}
 */
export function upgradeArtifact(artifact, hasSameSetMaterial = false) {
  const cap = ARTIFACT_UPGRADE_CAP[artifact.quality]
  const current = artifact.upgrade ?? 0
  if (current >= cap) {
    return {
      ok: false,
      reason: `品质 ${artifact.quality}（${QUALITY_LABEL[artifact.quality]}）的强化上限是 +${cap}，已达上限`,
    }
  }
  const next = current + 1
  if (next === 4 && hasSameSetMaterial !== true) {
    return { ok: false, reason: '+4 满级需要消耗一件同套装的同名圣遗物作为材料' }
  }
  return { ok: true, artifact: { ...artifact, upgrade: next } }
}

/**
 * 汇总一件武器的实际加成（含品质带来的伤害加成与特效解锁）。
 * @param {string} type - 武器类型。
 * @param {number} quality - 品质 1..5。
 * @returns {object}
 */
export function weaponStats(type, quality = 1) {
  return resolveWeapon(type, quality)
}

/**
 * 校验武器特效是否解锁。
 * @param {number} quality
 * @returns {boolean}
 */
export function weaponTraitUnlocked(quality) {
  return quality >= WEAPON_TRAIT_MIN_QUALITY
}

/**
 * 列出全部武器类型的基础数值（供工具返回给 GM）。
 * @returns {Array<object>}
 */
export function listWeapons() {
  return Object.entries(WEAPONS).map(([type, w]) => ({
    type,
    damage: w.damage,
    reduction: w.reduction,
    initiative: w.initiative,
    threat: w.threat,
    trait: w.trait,
    traitText: w.traitText,
  }))
}

/**
 * 列出全部套装（供工具返回给 GM）。
 * @returns {Array<object>}
 */
export function listSets() {
  return ARTIFACT_SET_NAMES.map((name) => ({
    name,
    slot3: ARTIFACT_SETS[name].slot3,
    two: ARTIFACT_SETS[name].two,
    three: ARTIFACT_SETS[name].three,
    twoMinQuality: ARTIFACT_SET_MIN_QUALITY.two,
    threeMinQuality: ARTIFACT_SET_MIN_QUALITY.three,
  }))
}

function findActiveSet(used, setCounts, threshold, minQuality) {
  for (const [setName, count] of Object.entries(setCounts)) {
    if (count < threshold) continue
    const pieces = used.filter((a) => a.set === setName)
    const lowest = Math.min(...pieces.map((a) => a.quality))
    if (lowest >= minQuality) return setName
  }
  return null
}

function assertQuality(q) {
  if (!Number.isInteger(q) || q < 1 || q > 5) {
    throw new Error(`品质必须是 1..5 的整数，收到 ${JSON.stringify(q)}`)
  }
}

function round5(v) {
  return Math.round(v / 5) * 5
}
