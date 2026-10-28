/**
 * 规则常量表。
 *
 * **本文件是 `finalized-stat-rules-v1.0.md` 在代码里的唯一落点。**
 * 改数值只改这里；其他模块一律从本文件读取，不得内联魔法数字。
 *
 * 状态：v0.1 定稿——结构锁定，参数可调。调整时须遵守 finalized-stat-rules-v1.0.md §11 的七条结构约束。
 */

/* ------------------------------------------------------------------ *
 * 一、判定
 * ------------------------------------------------------------------ */

/** 六属性，顺序固定（建卡、显示、日志都依赖此顺序）。 */
export const ATTRIBUTES = Object.freeze(['体魄', '灵巧', '心智', '感知', '交涉', '意志'])

/** 建卡的三种属性分配方案（总和均为 +3）。 */
export const BUILD_SCHEMES = Object.freeze({
  均衡: Object.freeze({ 体魄: 0, 灵巧: 1, 心智: 2, 感知: 1, 交涉: 0, 意志: -1 }),
  专精: Object.freeze({ 体魄: 0, 灵巧: 0, 心智: 2, 感知: 2, 交涉: 0, 意志: -1 }),
  通才: Object.freeze({ 体魄: 1, 灵巧: 1, 心智: 1, 感知: 1, 交涉: 0, 意志: -1 }),
})

/**
 * 校验一组建卡属性是否符合**任一**合法方案（总和对、且落在合法多重集内）。
 *
 * 注意：本函数只校验「总体上合法」，不要求等于某个具体方案的逐项取值——
 * 玩家可以自由把 +2/+1/+1/0/0/−1 分配到任意属性上。
 *
 * @param {Record<string, number>} attributes - 六属性修正。
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateBuild(attributes) {
  if (attributes === null || typeof attributes !== 'object') {
    return { ok: false, reason: '属性必须是一个对象' }
  }
  const values = []
  for (const name of ATTRIBUTES) {
    const v = attributes[name]
    if (!Number.isInteger(v)) {
      return { ok: false, reason: `属性「${name}」必须是整数，收到 ${JSON.stringify(v)}` }
    }
    if (v < -1 || v > 2) {
      return { ok: false, reason: `属性「${name}」的建卡取值必须在 −1..+2，收到 ${v}` }
    }
    values.push(v)
  }
  const total = values.reduce((a, b) => a + b, 0)
  if (total !== 3) {
    return { ok: false, reason: `属性总和必须是 +3（+2/+1/+1/0/0/−1），收到 ${total}` }
  }
  // v0.01：三种预算均为 +3；允许各方案多重集自由分配。
  const sorted = [...values].sort((a, b) => a - b).join(',')
  const allowed = Object.values(BUILD_SCHEMES).map((scheme) => Object.values(scheme).sort((a, b) => a - b).join(','))
  if (!allowed.includes(sorted)) {
    return { ok: false, reason: `属性必须符合均衡、专精或通才的多重集，收到 ${sorted}` }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------ *
 * 二、角色
 * ------------------------------------------------------------------ */

/** 角色数值常量。 */
export const CHARACTER = Object.freeze({
  /** HP 基数。`HP = 120 + 体魄修正 × 15`。 */
  hpBase: 120,
  /** 每点体魄修正换算的 HP。 */
  hpPerPhysique: 15,
  /** 每点体魄修正换算的伤害减免。 */
  damageReductionPerPhysique: 5,
  /** 元素能量上限。 */
  energyMax: 3,
  /** 元素能量的初始值。 */
  energyStart: 3,
  /** 强力元素技的能量消耗。 */
  energyCostPerSkill: 1,
  /** 标签：建卡数量。 */
  tagsAtBuild: 3,
  /** 标签：上限（主成长轨道）。 */
  tagsMax: 6,
  /** 属性：成长后总上限。 */
  attributeGrowthMax: 3,
  /** 属性：全程最多再 +1。 */
  attributeGrowthSteps: 1,
  /** 专长：最多几项。 */
  expertisesMax: 3,
})

/**
 * 由体魄修正算出最大 HP。
 * @param {number} physiqueMod - 体魄修正。
 * @returns {number}
 */
export function maxHpFor(physiqueMod) {
  assertInt(physiqueMod, '体魄修正')
  return CHARACTER.hpBase + physiqueMod * CHARACTER.hpPerPhysique
}

/**
 * 由体魄修正算出伤害减免。
 * @param {number} physiqueMod - 体魄修正。
 * @returns {number}
 */
export function damageReductionFor(physiqueMod) {
  assertInt(physiqueMod, '体魄修正')
  return physiqueMod * CHARACTER.damageReductionPerPhysique
}

/** 单个标签的修正范围。 */
export const TAG_MODIFIER_RANGE = Object.freeze({ min: -1, max: 1 })

/* ------------------------------------------------------------------ *
 * 三、武器（数值定稿v1.0 §5）
 * ------------------------------------------------------------------ */

/**
 * 五类武器的四维。
 *
 * - `damage`：单次命中伤害
 * - `reduction`：伤害减免（负数表示**更易受伤**）
 * - `initiative`：先攻修正
 * - `threat`：仇恨权重（1.0 为基准）
 * - `trait`：专属特效名（★★★ 以上解锁）
 */
export const WEAPONS = Object.freeze({
  单手剑: Object.freeze({
    damage: 25, reduction: 0, initiative: 1, threat: 1.5,
    trait: '连击', traitText: '大成功时追加一次 20 伤害的攻击',
  }),
  双手剑: Object.freeze({
    damage: 40, reduction: 15, initiative: 0, threat: 1.5,
    trait: '破防', traitText: '命中后目标减伤 −15（可叠至 −30）',
  }),
  弓: Object.freeze({
    damage: 25, reduction: -10, initiative: 2, threat: 0.5,
    trait: '先手狙击', traitText: '战斗第一轮命中则伤害 +15',
  }),
  法器: Object.freeze({
    damage: 15, reduction: -10, initiative: 2, threat: 0.5,
    trait: '元素亲和', traitText: '元素反应加成 ×2；每场战斗一次可无视附着状态直接触发一种反应',
  }),
  长枪: Object.freeze({
    damage: 25, reduction: 0, initiative: 1, threat: 1.0,
    trait: '拒马', traitText: '本轮未移动则受伤 −15；敌人无法在近身时获得先攻优势',
  }),
})

/** 武器类型列表。 */
export const WEAPON_TYPES = Object.freeze(Object.keys(WEAPONS))

/** 品质的伤害修正（`weapon_setting.md` 的「+1 攻击」= +5 伤害）。 */
export const QUALITY_DAMAGE_BONUS = Object.freeze({
  1: 0,
  2: 5,
  3: 10,
  4: 20,
  5: 35,
})

/** 武器特效在 ★★★ 及以上解锁。 */
export const WEAPON_TRAIT_MIN_QUALITY = 3

/** 品质名称。 */
export const QUALITY_LABEL = Object.freeze({
  1: '凡品', 2: '良品', 3: '精品', 4: '秘宝', 5: '神铸',
})

/**
 * 由武器类型与品质算出实际数值。
 * @param {keyof WEAPONS} type - 武器类型。
 * @param {number} quality - 品质 1..5。
 * @returns {{ type: string, quality: number, damage: number, reduction: number, initiative: number, threat: number, trait: string|null }}
 */
export function resolveWeapon(type, quality = 1) {
  const base = WEAPONS[type]
  if (base === undefined) throw new Error(`resolveWeapon: 未知武器类型「${type}」`)
  if (!Number.isInteger(quality) || quality < 1 || quality > 5) {
    throw new Error(`resolveWeapon: 品质必须是 1..5，收到 ${quality}`)
  }
  return {
    type,
    quality,
    damage: base.damage + QUALITY_DAMAGE_BONUS[quality],
    reduction: base.reduction,
    initiative: base.initiative,
    threat: base.threat,
    trait: quality >= WEAPON_TRAIT_MIN_QUALITY ? base.trait : null,
  }
}

/* ------------------------------------------------------------------ *
 * 四、圣遗物（数值定稿v1.0 §6）
 * ------------------------------------------------------------------ */

/** 三个槽位。 */
export const ARTIFACT_SLOTS = Object.freeze(['生之花', '死之羽', '理之冠'])

/** 各槽位的**固定**加成（与品质、套装无关）。 */
export const ARTIFACT_HP_BONUS = 10

export const ARTIFACT_SLOT_BASE = Object.freeze({
  生之花: Object.freeze({ hp: ARTIFACT_HP_BONUS }),
  死之羽: Object.freeze({ initiative: 1 }),
  理之冠: Object.freeze({}), // 由套装决定
})

/** 品质对应的可强化上限。 */
export const ARTIFACT_UPGRADE_CAP = Object.freeze({ 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 })

/** 每级强化的加成比例。 */
export const ARTIFACT_UPGRADE_STEP = 0.25

/** 套效门槛：2 件触发 2件套；3 件触发 2件套 + 3件套。 */
export const ARTIFACT_SET_THRESHOLD = Object.freeze({ two: 2, three: 3 })

/** 2件套效果从 ★★★ 起生效，3件套从 ★★★★ 起生效。 */
export const ARTIFACT_SET_MIN_QUALITY = Object.freeze({ two: 3, three: 4 })

/* ------------------------------------------------------------------ *
 * 五、元素反应（数值定稿v1.0 §7）
 * ------------------------------------------------------------------ */

/** 增幅型反应的固定加成。 */
export const REACTION_AMPLIFY_BONUS = 20
/** 剧变型反应的固定加成。 */
export const REACTION_TRANSFORM_BONUS = 10
/** 持续伤害的默认轮数与每轮伤害。 */
export const DOT = Object.freeze({ defaultRounds: 2, damagePerRound: 10 })

/* ------------------------------------------------------------------ *
 * 六、敌人（数值定稿v1.0 §8）
 * ------------------------------------------------------------------ */

/**
 * 敌人数值表的**基础值**（未按队伍人数缩放）。
 *
 * - `hpBase`：基础 HP。实际 HP = `hpBase × n`。
 * - `attacksPerRound`：每轮攻击次数。
 * - `aoeBase`：群攻基础值（按 `1 + 0.10n` **递增**）。
 * - `singleBase`：随机单体基础值（按 `1 − 0.10n` **递减**）；`null` 表示该敌人只有单体攻击。
 */
export const ENEMY_BASE = Object.freeze({
  1: Object.freeze({ label: '杂兵', hpBase: 20, attacksPerRound: 1, aoeBase: null, singleBase: 8, hitMod: 0 }),
  2: Object.freeze({ label: '劲敌', hpBase: 40, attacksPerRound: 2, aoeBase: 14, singleBase: 18, hitMod: 1 }),
  3: Object.freeze({ label: '首领', hpBase: 70, attacksPerRound: 2, aoeBase: 24, singleBase: 26, hitMod: 2 }),
})

/** 单人档首领最终值，直接使用，不再乘人数系数（2026-10-15 修订）。 */
export const ENEMY_BASE_SOLO = Object.freeze({
  3: Object.freeze({ label: '首领', hpBase: 110, attacksPerRound: 2, aoeBase: 18, singleBase: 20, hitMod: 2 }),
})

/** 正减伤最多吸收本次减伤前伤害的80%；负减伤不受此上限影响。 */
export const MAX_POSITIVE_REDUCTION_RATIO = 0.8
export const INDEPENDENT_SOLO = Object.freeze({
  hpFactor: 0.6,
  hpFloors: Object.freeze({ 1: 20, 2: 30, 3: 5 }),
  minimumSingleDamage: 12,
  rounding: '仅HP向下取5的倍数并应用下限；群攻与单体不再乘0.6',
  lockedAtStart: true,
})

/** 群攻的 n 系数（递增）。 */
export const AOE_SCALE_PER_N = 0.10
/** 随机单体的 n 系数（递减）。 */
export const SINGLE_SCALE_PER_N = -0.10

/** 战斗硬上限轮数。 */
export const COMBAT_ROUND_CAP = 4

/** 敌人掷命中的基础目标值。 */
export const ENEMY_HIT_TARGET = 7

/** 防御姿态对敌方目标值的加值。 */
export const DEFEND_STANCE_BONUS = 2

/* ------------------------------------------------------------------ *
 * 七、HP 恢复（数值定稿v1.0 §9）
 * ------------------------------------------------------------------ */

/** 恢复层级。`ratio` 为最大 HP 的比例。 */
export const RECOVERY = Object.freeze({
  喘息: Object.freeze({ ratio: 0, clears: 'none' }),
  短休: Object.freeze({ ratio: 0.10, clears: 'one_temporary' }),
  扎营: Object.freeze({ ratio: 0.40, clears: 'all_temporary' }),
  休整: Object.freeze({ ratio: 1.00, clears: 'all' }),
})

/** 关系值四阶。 */
export const RELATION_TIERS = Object.freeze(['陌生', '相识', '信任', '羁绊'])

/** 医者类 NPC 提供治疗所需的最低关系阶。 */
export const RELATION_MIN_FOR_HEALING = '信任'

/* ------------------------------------------------------------------ *
 * 八、剧情轮次（数值定稿v1.0 §4）
 * ------------------------------------------------------------------ */

/** 每名队友协助给予的加值。 */
export const SCENE_HELP_BONUS = 1
/** 协助加值的上限。 */
export const SCENE_HELP_MAX = 2
/** 一个「场」包含的检定次数建议区间。 */
export const SCENE_CHECKS_PER_SCENE = Object.freeze({ min: 1, max: 3 })

/* ------------------------------------------------------------------ *
 * 九、剧透闸门
 * ------------------------------------------------------------------ */

/** 剧透四级，按从松到严排序。 */
export const SPOILER_LEVELS = Object.freeze(['公开', '剧情', '隐藏', '禁止'])

/**
 * 给定请求级别，返回**允许返回**的最高剧透等级。
 *
 * 「禁止」级**任何情况下都不返回**，因此永远不在允许集合中。
 *
 * @param {'公开'|'剧情'|'隐藏'} requestLevel - 请求级别。
 * @returns {Set<string>} 允许返回的等级集合。
 */
export function allowedSpoilerLevels(requestLevel) {
  if (!SPOILER_LEVELS.includes(requestLevel) || requestLevel === '禁止') {
    throw new Error(`allowedSpoilerLevels: 请求级别必须是 公开 / 剧情 / 隐藏，收到 ${requestLevel}`)
  }
  const maxIndex = SPOILER_LEVELS.indexOf(requestLevel)
  // 排除「禁止」（index 3），它永不返回。
  return new Set(SPOILER_LEVELS.slice(0, maxIndex + 1).filter((l) => l !== '禁止'))
}

/* ------------------------------------------------------------------ *
 * 十、存档
 * ------------------------------------------------------------------ */

/** 两种模式。 */
export const MODES = Object.freeze(['solo', 'multi'])

/** 事件类型枚举。 */
export const EVENT_KINDS = Object.freeze([
  'roll', 'check', 'attack', 'damage', 'apply', 'combat', 'scene',
  'gear', 'char', 'state', 'narrate', 'save', 'relation',
])

/** 存档 schema 版本。 */
export const SCHEMA_VERSION = '1.0'

function assertInt(value, name) {
  if (!Number.isInteger(value)) {
    throw new Error(`${name} 必须是整数，收到 ${JSON.stringify(value)}`)
  }
}
