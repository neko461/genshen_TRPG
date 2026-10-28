/**
 * 装备、伤害、战斗、剧情轮次测试。
 *
 * 验证 `finalized-stat-rules-v1.0.md` §5–§8 的关键数值与结构。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ARTIFACT_SET_NAMES,
  makeArtifact,
  artifactBonus,
  resolveArtifactSet,
  upgradeArtifact,
  weaponStats,
  weaponTraitUnlocked,
} from '../engine/gear.js'
import { findReaction, resolveDamage, ELEMENTS } from '../engine/damage.js'
import {
  advanceRound,
  enemyAttackRoll,
  initiativeOf,
  pickTarget,
  resolvePlayerAttack,
  scaleEnemy,
  startCombat,
} from '../engine/combat.js'
import { closeScene, helpBonus, openScene, pickLead, sceneCheck, combinePartyAttribute } from '../engine/scene.js'
import { createSequenceRng } from '../engine/rng.js'
import { COMBAT_ROUND_CAP } from '../engine/rules.js'

/* ------------------------------ 武器 ------------------------------ */

test('weaponStats：五类武器的四维与品质缩放', () => {
  assert.deepEqual(weaponStats('单手剑', 1), {
    type: '单手剑', quality: 1, damage: 25, reduction: 0, initiative: 1, threat: 1.5, trait: null,
  })
  // ★★★ 起解锁特效
  assert.equal(weaponStats('单手剑', 3).trait, '连击')
  assert.equal(weaponTraitUnlocked(2), false)
  assert.equal(weaponTraitUnlocked(3), true)
  // 「+1 攻击」= +5 伤害
  assert.equal(weaponStats('单手剑', 2).damage, 30)
  assert.equal(weaponStats('双手剑', 1).reduction, 15)
  assert.equal(weaponStats('弓', 1).reduction, -10)
})

/* ----------------------------- 圣遗物 ----------------------------- */

test('artifactBonus：基础加成与品质无关，强化按 +25% 累计', () => {
  const a = makeArtifact({ set: '冒险家', slot: '生之花', quality: 5 })
  assert.deepEqual(artifactBonus(a), { hp: 10 })
  const b = makeArtifact({ set: '冒险家', slot: '生之花', quality: 5, upgrade: 4 })
  // 10 × (1 + 4×0.25) = 20
  assert.deepEqual(artifactBonus(b), { hp: 20 })
})

test('artifactBonus：理之冠的加成由套装决定', () => {
  const a = makeArtifact({ set: '战狂', slot: '理之冠', quality: 4 })
  assert.deepEqual(artifactBonus(a), { damage: 10 })
  const b = makeArtifact({ set: '如雷的盛怒', slot: '理之冠', quality: 4 })
  assert.deepEqual(artifactBonus(b), { initiative: 2 })
})

test('resolveArtifactSet：2件套从 ★★★ 起、3件套从 ★★★★ 起生效', () => {
  // 三件 ★★：2件套不生效（品质不足）
  const low = resolveArtifactSet([
    makeArtifact({ set: '战狂', slot: '生之花', quality: 2 }),
    makeArtifact({ set: '战狂', slot: '死之羽', quality: 2 }),
    makeArtifact({ set: '战狂', slot: '理之冠', quality: 2 }),
  ])
  assert.equal(low.activeTwo, null, '★★ 时 2件套不应生效')
  assert.equal(low.activeThree, null)

  // 三件 ★★★：2件套生效，3件套不生效
  const mid = resolveArtifactSet([
    makeArtifact({ set: '战狂', slot: '生之花', quality: 3 }),
    makeArtifact({ set: '战狂', slot: '死之羽', quality: 3 }),
    makeArtifact({ set: '战狂', slot: '理之冠', quality: 3 }),
  ])
  assert.equal(mid.activeTwo, '战狂')
  assert.equal(mid.activeThree, null, '★★★ 时 3件套不应生效')

  // 三件 ★★★★：两者都生效
  const full = resolveArtifactSet([
    makeArtifact({ set: '战狂', slot: '生之花', quality: 4 }),
    makeArtifact({ set: '战狂', slot: '死之羽', quality: 4 }),
    makeArtifact({ set: '战狂', slot: '理之冠', quality: 4 }),
  ])
  assert.equal(full.activeTwo, '战狂')
  assert.equal(full.activeThree, '战狂')
  assert.equal(full.setEffects.length, 2)
})

test('resolveArtifactSet：3 槽位只能全集齐或 2+1', () => {
  const mixed = resolveArtifactSet([
    makeArtifact({ set: '战狂', slot: '生之花', quality: 4 }),
    makeArtifact({ set: '战狂', slot: '死之羽', quality: 4 }),
    makeArtifact({ set: '冒险家', slot: '理之冠', quality: 4 }),
  ])
  assert.equal(mixed.activeTwo, '战狂')
  assert.equal(mixed.activeThree, null, '2+1 拿不到 3件套')
})

test('resolveArtifactSet：重复槽位抛错', () => {
  assert.throws(() => resolveArtifactSet([
    makeArtifact({ set: '战狂', slot: '生之花', quality: 4 }),
    makeArtifact({ set: '战狂', slot: '生之花', quality: 4 }),
  ]), /重复装备/)
})

test('upgradeArtifact：上限约束与 +4 的材料要求', () => {
  const a = makeArtifact({ set: '战狂', slot: '生之花', quality: 4 }) // 上限 +3
  assert.equal(upgradeArtifact(a, true).ok, true)
  const atCap = makeArtifact({ set: '战狂', slot: '生之花', quality: 4, upgrade: 3 })
  assert.equal(upgradeArtifact(atCap, true).ok, false)

  // +4 需要同套装材料
  const plus3 = makeArtifact({ set: '沉沦之心', slot: '生之花', quality: 5, upgrade: 3 })
  assert.equal(upgradeArtifact(plus3, false).ok, false, '+4 无材料应失败')
  assert.equal(upgradeArtifact(plus3, true).ok, true)

  // ★ 不可强化
  const oneStar = makeArtifact({ set: '战狂', slot: '生之花', quality: 1 })
  assert.equal(upgradeArtifact(oneStar, true).ok, false)
})

test('ARTIFACT_SET_NAMES：12 套装齐备', () => {
  assert.equal(ARTIFACT_SET_NAMES.length, 12)
})

/* ---------------------------- 元素反应 ---------------------------- */

test('findReaction：11 条反应逐条命中，且为无序匹配', () => {
  const cases = [
    ['火', '水', '蒸发'],
    ['水', '火', '蒸发'], // 反向
    ['火', '冰', '融化'],
    ['冰', '火', '融化'],
    ['水', '冰', '冻结'],
    ['冰', '水', '冻结'],
    ['火', '雷', '超载'],
    ['水', '雷', '感电'],
    ['冰', '雷', '超导'],
    ['火', '草', '燃烧'],
    ['雷', '草', '激化'],
    ['水', '草', '绽放'],
  ]
  for (const [a, b, expected] of cases) {
    assert.equal(findReaction(a, b)?.name, expected, `${a}+${b} 应为 ${expected}`)
    assert.equal(findReaction(b, a)?.name, expected, `${b}+${a} 应为 ${expected}（无序）`)
  }
  // 同元素不反应
  for (const e of ELEMENTS) assert.equal(findReaction(e, e), null, `${e}+${e} 不应反应`)
  // 无附着不反应
  assert.equal(findReaction('火', null), null)
})

test('findReaction：风/岩为通配（+已附着）', () => {
  assert.equal(findReaction('风', '火')?.name, '扩散')
  assert.equal(findReaction('风', '冰')?.name, '扩散')
  assert.equal(findReaction('岩', '雷')?.name, '结晶')
  assert.equal(findReaction('岩', '水')?.name, '结晶')
})

test('resolveDamage：蒸发 +20，法器元素亲和翻倍为 +40', () => {
  const normal = resolveDamage({
    weaponDamage: 15, attackerElement: '火', attachedElement: '水', targetReduction: 0,
  })
  assert.equal(normal.reaction, '蒸发')
  assert.equal(normal.reactionBonus, 20)
  assert.equal(normal.final, 35)
  assert.equal(normal.consumesAttached, true)

  const catalyst = resolveDamage({
    weaponDamage: 15, attackerElement: '火', attachedElement: '水', catalystAffinity: true,
  })
  assert.equal(catalyst.reactionBonus, 40, '法器元素亲和应使反应加成翻倍')
  assert.equal(catalyst.final, 55)
})

test('resolveDamage：未命中不受反应影响', () => {
  const r = resolveDamage({
    weaponDamage: 25, attackerElement: '火', attachedElement: '水', tier: 'failure',
  })
  assert.equal(r.final, 0)
  assert.equal(r.reaction, null, '未命中不应触发反应')
})

test('resolveDamage：结算链 = 武器 + 反应 + 圣遗物 − 减伤', () => {
  const r = resolveDamage({
    weaponDamage: 40,
    bonusDamage: 15,
    attackerElement: '火',
    attachedElement: '冰',
    targetReduction: 25,
  })
  assert.equal(r.reaction, '融化')
  assert.equal(r.subtotal, 40 + 20 + 15)
  assert.equal(r.reduction, 25)
  assert.equal(r.final, 50)
})

test('resolveDamage：双手剑破防降低目标减伤', () => {
  const r = resolveDamage({
    weaponDamage: 40, targetReduction: 20, weaponTrait: '破防',
  })
  assert.equal(r.targetReductionDelta, -15)
  assert.equal(r.reduction, 5, '减伤 20 被破防降到 5')
})

test('resolveDamage：超导降低目标减伤', () => {
  const r = resolveDamage({ weaponDamage: 25, attackerElement: '冰', attachedElement: '雷', targetReduction: 10 })
  assert.equal(r.reaction, '超导')
  assert.equal(r.reduction, 0, '减伤 10 被超导降到 0')
})

/* ---------------------------- 敌人缩放 ---------------------------- */

test('scaleEnemy：HP × n，群攻递增、单体递减', () => {
  const n1 = scaleEnemy(3, 1)
  const n4 = scaleEnemy(3, 4)
  assert.equal(n1.hp, 70)
  assert.equal(n4.hp, 280, '首领 HP = 70 × n')
  // 群攻：24 × (1+0.10n)
  assert.equal(n1.aoe, 26)
  assert.equal(n4.aoe, 34)
  // 单体：26 × (1−0.10n)
  assert.equal(n1.single, 23)
  assert.equal(n4.single, 16)
  assert.ok(n4.aoe > n1.aoe, '群攻必须随 n 递增')
  assert.ok(n4.single < n1.single, '单体必须随 n 递减')
})

test('scaleEnemy：杂兵只有单体攻击', () => {
  const mob = scaleEnemy(1, 4)
  assert.equal(mob.aoe, null)
  assert.equal(mob.attacksPerRound, 1)
})

test('scaleEnemy：单人档首领使用下调后的基础值', () => {
  const solo = scaleEnemy(3, 1, true)
  assert.equal(solo.hp, 110)
  assert.equal(solo.aoe, 18)
  assert.equal(solo.single, 20)
})

/* ---------------------------- 战斗流程 ---------------------------- */

test('initiativeOf：感知 + 武器 + 圣遗物 + 情境', () => {
  assert.equal(initiativeOf({ perception: 1, weaponType: '弓', gearInitiative: 2, circumstance: 2 }), 7)
  assert.equal(initiativeOf({ perception: 0, weaponType: '双手剑' }), 0)
})

test('敌人掷命中：防御姿态把目标值 +2', () => {
  const enemy = { hitMod: 0 } // 杂兵
  // 裸骰 3+3=6，目标值 7 → 未命中
  const miss = enemyAttackRoll(enemy, { stance: '攻击' }, createSequenceRng([3, 3]))
  assert.equal(miss.targetNumber, 7)
  assert.equal(miss.hit, false)

  // 同样 6，但防御姿态目标值 9 → 仍未命中；用 8 对比
  const normal8 = enemyAttackRoll(enemy, { stance: '攻击' }, createSequenceRng([4, 4]))
  assert.equal(normal8.hit, true, '攻击姿态下 8 ≥ 7 命中')
  const defend8 = enemyAttackRoll(enemy, { stance: '防御' }, createSequenceRng([4, 4]))
  assert.equal(defend8.targetNumber, 9)
  assert.equal(defend8.hit, false, '防御姿态下 8 < 9 未命中')
})

test('pickTarget：仇恨权重决定被选中概率', () => {
  const candidates = [
    { id: '双手剑', threat: 1.5 },
    { id: '弓', threat: 0.5 },
    { id: '长枪', threat: 1.0 },
  ]
  const { weights } = pickTarget(candidates, () => 0)
  const byId = Object.fromEntries(weights.map((w) => [w.id, w.probability]))
  assert.ok(Math.abs(byId['双手剑'] - 0.5) < 1e-9, '双手剑应占 50%')
  assert.ok(Math.abs(byId['弓'] - 1 / 6) < 1e-9, '弓应占 16.7%')
  assert.ok(Math.abs(byId['长枪'] - 1 / 3) < 1e-9, '长枪应占 33.3%')
})

test('战斗：4 轮硬上限强制 stalemate', () => {
  const state = startCombat({
    partyN: 2,
    party: [{ id: 'pc', initiative: 2 }],
    enemies: [{ id: 'boss', threat: 3, initiative: 2 }],
  })
  // 每次 advanceRound 代表「一轮打完」。前 3 轮不应结束，第 4 轮打完触发硬上限。
  for (let i = 1; i < COMBAT_ROUND_CAP; i += 1) {
    const r = advanceRound(state)
    assert.equal(r.over, false, `第 ${i} 轮不应结束`)
  }
  const result = advanceRound(state)
  assert.equal(result.over, true)
  assert.equal(result.outcome, 'stalemate')
  assert.equal(result.forceStalemate, true)
})

test('战斗：多阶段按 HP 阈值转换，超时结束且不追加血条', () => {
  const state = startCombat({
    partyN: 4,
    party: [{ id: 'pc', initiative: 2 }],
    enemies: [{ id: 'boss', threat: 3, initiative: 2 }],
    phases: 2,
  })
  const boss = state.enemies[0]
  boss.hp = boss.max_hp / 2
  let result = advanceRound(state)
  assert.equal(result.over, false)
  assert.equal(result.phase, 2)
  assert.equal(result.round, 1, '新阶段轮次清零')
  assert.equal(state.roundsCompleted, 0, '新阶段已完成轮数清零')
  assert.equal(boss.hp, 140, '切阶段不回血或重建总 HP')

  // 阶段 2 的 4 轮打完 → 此时才收场
  for (let i = 1; i <= COMBAT_ROUND_CAP; i += 1) result = advanceRound(state)
  assert.equal(result.over, true)
  assert.equal(result.outcome, 'stalemate')
})

test('战斗：敌人 HP 归零即胜利', () => {
  const state = startCombat({
    partyN: 1,
    party: [{ id: 'pc', initiative: 2 }],
    enemies: [{ id: 'mob', threat: 1, initiative: 0 }],
  })
  state.enemies[0].hp = 0
  const result = advanceRound(state)
  assert.equal(result.outcome, 'victory')
})

test('resolvePlayerAttack：扣血、附着消耗、反应生效', () => {
  const state = startCombat({
    partyN: 2,
    party: [{ id: 'pc', initiative: 2 }],
    enemies: [{ id: 'mob', threat: 2, initiative: 1 }],
  })
  const enemy = state.enemies[0]
  enemy.attached_element = '水'
  const before = enemy.hp
  const out = resolvePlayerAttack({
    weaponType: '单手剑',
    attackerElement: '火',
    targetEnemy: enemy,
    tier: 'success',
  })
  assert.equal(out.resolved.reaction, '蒸发')
  assert.equal(enemy.attached_element, null, '触发反应后附着元素被消耗')
  assert.ok(enemy.hp < before)
})

/* ---------------------------- 剧情轮次 ---------------------------- */

test('剧情轮次：协助加值 +1/人、上限 +2', () => {
  assert.deepEqual(helpBonus(0), { bonus: 0, effective: 0, capped: false })
  assert.deepEqual(helpBonus(1), { bonus: 1, effective: 1, capped: false })
  assert.deepEqual(helpBonus(2), { bonus: 2, effective: 2, capped: false })
  assert.deepEqual(helpBonus(3), { bonus: 3, effective: 2, capped: true })
})

test('剧情轮次：pickLead 选该属性最高者', () => {
  const party = [
    { id: 'a', attributes: { 心智: 2 } },
    { id: 'b', attributes: { 心智: 0 } },
    { id: 'c', attributes: { 心智: 1 } },
  ]
  assert.equal(pickLead(party, '心智').lead.id, 'a')
})

test('剧情轮次：combinePartyAttribute 取最高或最低', () => {
  const party = [
    { id: 'a', attributes: { 体魄: 2 } },
    { id: 'b', attributes: { 体魄: -1 } },
  ]
  assert.equal(combinePartyAttribute(party, '体魄', false).value, 2)
  assert.equal(combinePartyAttribute(party, '体魄', true).value, -1)
})

test('剧情轮次：一次检定代表全队，且超过 3 次检定被拒', () => {
  const scene = openScene({ goal: '撬开往生堂地下仪式间的石门' })
  const rng = () => createSequenceRng([4, 4])()
  const r1 = sceneCheck(scene, { attribute: '灵巧', attributeMod: 1, helpers: 2, d6Source: rng })
  assert.equal(r1.helpBonus, 2)
  sceneCheck(scene, { attribute: '灵巧', attributeMod: 1, d6Source: rng })
  sceneCheck(scene, { attribute: '灵巧', attributeMod: 1, d6Source: rng })
  assert.throws(
    () => sceneCheck(scene, { attribute: '灵巧', attributeMod: 1, d6Source: rng }),
    /一次检定建议|已达上限/,
  )
})

test('剧情轮次：closeScene 恢复元素能量并给出档位汇总', () => {
  const scene = openScene({ goal: '向凝光说明来意' })
  sceneCheck(scene, { attribute: '交涉', attributeMod: 2, d6Source: createSequenceRng([5, 5]) })
  const result = closeScene(scene, { summary: '凝光应允了会面' })
  assert.equal(result.energyRestored, true)
  assert.equal(result.outcome, 'success')
  assert.equal(result.checkCount, 1)
})

test('剧情轮次：openScene 要求具体目标', () => {
  assert.throws(() => openScene({ goal: '  ' }), /具体的 goal/)
})
