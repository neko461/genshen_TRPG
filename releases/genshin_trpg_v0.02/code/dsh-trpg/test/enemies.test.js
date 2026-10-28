import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ENEMY_ROSTER, listEnemies, resolveEnemy } from '../engine/enemies.js'
import { startCombat, scaleEnemy, advanceRound } from '../engine/combat.js'
import { resolveTier } from '../engine/dice.js'
import { resolveDamage } from '../engine/damage.js'

test('运行名录：24 个模板与文档逐条对应，不重启历史首领', () => {
  const docs = readFileSync(new URL('../../../light_rule/enemy_setting.md', import.meta.url), 'utf8')
  assert.equal(listEnemies().length, 24)
  for (const e of Object.values(ENEMY_ROSTER)) assert.ok(docs.includes(`| ${e.name} |`), e.name)
  for (const name of ['女士', '正机之神', '博士·多托雷']) assert.throws(() => resolveEnemy({ name }))
})

test('按名称开战：等级与元素来自运行名录，未知名称须明确自定义等级', () => {
  const state = startCombat({ partyN: 1, soloMode: true, enemies: [{ name: '急冻树' }] })
  assert.equal(state.enemies[0].threat, 3)
  assert.equal(state.enemies[0].element, '冰')
  assert.equal(state.enemies[0].hp, 110)
  assert.throws(() => startCombat({ enemies: [{ name: '拼错的敌名' }] }))
  assert.throws(() => resolveEnemy({ template: '急冻树', threat: 1 }))
  assert.equal(resolveEnemy({ name: '自定义守卫', threat: 1 }).threat, 1)
  assert.throws(() => resolveEnemy({ name: '自定义守卫', threat: '1' }))
  assert.throws(() => resolveEnemy({ template: '史莱姆', element: '月' }))
})

test('旧名归并：执灯人挑战只对应一个西格德，药剂师共用模板', () => {
  assert.equal(resolveEnemy({ name: '历经百战的执灯人' }).template, '西格德')
  assert.equal(resolveEnemy({ name: '盗宝团·火之药剂师' }).template, '盗宝团药剂师')
})

test('整场预算：拒绝首领叠精英与五单位；两个劲敌只保留一份群攻', () => {
  assert.throws(() => startCombat({ enemies: [{ threat: 3 }, { threat: 1 }] }))
  assert.throws(() => startCombat({ enemies: Array.from({ length: 5 }, () => ({ threat: 1 })) }))
  assert.throws(() => startCombat({ enemies: [] }))
  const state = startCombat({ partyN: 3, enemies: [{ threat: 2 }, { threat: 2 }] })
  assert.equal(state.encounter.cost, 4)
  assert.equal(state.enemies.filter((e) => e.aoeEligible).length, 1)
  assert.equal(state.enemies[1].aoe, null)
  assert.equal(state.enemies[1].attacksPerRound, 1)
})

test('敌人缩放：整数口径不再把低伤害压到 5，人数与单人模式受限', () => {
  assert.equal(scaleEnemy(1, 1).single, 7)
  assert.equal(scaleEnemy(1, 4).single, 5)
  assert.throws(() => scaleEnemy(3, 5))
  assert.throws(() => scaleEnemy(3, 3, true))
  for (const threat of [1, 2, 3]) {
    let previous = scaleEnemy(threat, 1)
    for (const n of [2, 3, 4]) {
      const now = scaleEnemy(threat, n)
      assert.ok(now.single <= previous.single)
      if (now.aoe !== null) assert.ok(now.aoe >= previous.aoe)
      assert.equal(now.hp, previous.hp / (n - 1) * n)
      previous = now
    }
  }
})

test('首领阶段：不以超时切阶段，第三阶段阈值不恢复血量', () => {
  const stalled = startCombat({ enemies: [{ threat: 3 }], phases: 3 })
  for (let i = 0; i < 4; i++) advanceRound(stalled)
  assert.equal(stalled.phase, 1)
  assert.equal(stalled.outcome, 'stalemate')
  assert.throws(() => advanceRound(stalled))
  const hurt = startCombat({ enemies: [{ threat: 3 }], phases: 3 })
  hurt.enemies[0].hp = 15
  advanceRound(hurt)
  assert.equal(hurt.phase, 3)
  assert.equal(hurt.enemies[0].hp, 15)
  assert.throws(() => startCombat({ enemies: [{ threat: 1 }], phases: 2 }))
  assert.throws(() => startCombat({ enemies: [{ threat: 3 }], phases: 4 }))
})

test('四轮节奏基线：计入失败与代价伤害后，首领 HP 不再按必中输出估算', () => {
  let total = 0
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    total += resolveDamage({ weaponDamage: 25, tier: resolveTier(a + b + 3, a + b) }).final
  }
  const average = total / 36
  assert.ok(Math.abs(average - 18.583333333333332) < 1e-9)
  assert.ok(90 / average > 4, '旧数值的无反应基线超过四轮')
  assert.ok(scaleEnemy(3, 4).hp / (4 * average) < 4, '新数值的平均输出估算约 3.77 轮')
  assert.equal(scaleEnemy(2, 1).hp, 40)
})
