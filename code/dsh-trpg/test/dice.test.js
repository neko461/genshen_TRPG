/**
 * 骰点内核测试。
 *
 * 重点验证 `finalized-stat-rules-v1.0.md` §1.1 的**核心结构**：
 * **档位看合计值，大成功/大失败看裸骰**，且大成功概率恒为 2.8%。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CRIT_FAIL_NATURAL,
  CRIT_SUCCESS_NATURAL,
  TIER,
  check,
  parseDiceExpression,
  resolveTier,
  rollExpression,
} from '../engine/dice.js'
import { createSequenceRng } from '../engine/rng.js'
import { validateBuild, maxHpFor, damageReductionFor } from '../engine/rules.js'

test('parseDiceExpression：基本形式', () => {
  assert.deepEqual(parseDiceExpression('2d6'), { terms: [{ count: 2, faces: 6 }], modifier: 0 })
  assert.deepEqual(parseDiceExpression('d6'), { terms: [{ count: 1, faces: 6 }], modifier: 0 })
  assert.deepEqual(parseDiceExpression('3d6+1'), { terms: [{ count: 3, faces: 6 }], modifier: 1 })
  assert.deepEqual(parseDiceExpression('2d6-2'), { terms: [{ count: 2, faces: 6 }], modifier: -2 })
  assert.deepEqual(parseDiceExpression('1d6+1d6'), {
    terms: [{ count: 1, faces: 6 }, { count: 1, faces: 6 }],
    modifier: 0,
  })
})

test('parseDiceExpression：非法输入抛错', () => {
  assert.throws(() => parseDiceExpression(''), /非空字符串/)
  assert.throws(() => parseDiceExpression('abc'), /无法解析/)
  assert.throws(() => parseDiceExpression('0d6'), /数量必须 ≥1/)
  assert.throws(() => parseDiceExpression('2d1'), /骰面数必须 ≥2/)
})

test('rollExpression：骰面与合计正确', () => {
  const rng = createSequenceRng([4, 3])
  const r = rollExpression('2d6+1', () => rng())
  assert.deepEqual(r.dice, [4, 3])
  assert.equal(r.raw, 7)
  assert.equal(r.total, 8)
  assert.equal(r.natural, 7)
})

test('rollExpression：非 2d6 时 natural 为 null', () => {
  const rng = createSequenceRng([1, 2, 3])
  const r = rollExpression('3d6', () => rng())
  assert.equal(r.natural, null, '3d6 不应给出裸骰合计')
  assert.equal(r.total, 6)
})

test('resolveTier：裸骰 2 必为大失败，无视修正', () => {
  // 合计被推到很高，但裸骰是 2 → 仍是大失败
  assert.equal(resolveTier(15, CRIT_FAIL_NATURAL), TIER.CRITICAL_FAILURE)
})

test('resolveTier：裸骰 12 必为大成功，无视修正', () => {
  // 裸骰 12 时合计必然是 12 + 修正，但即便修正为负也是大成功
  assert.equal(resolveTier(9, CRIT_SUCCESS_NATURAL), TIER.CRITICAL_SUCCESS)
})

test('resolveTier：档位边界（合计值）', () => {
  const cases = [
    [6, TIER.FAILURE],
    [7, TIER.SUCCESS_COST],
    [9, TIER.SUCCESS_COST],
    [10, TIER.SUCCESS],
    [11, TIER.SUCCESS],
    [12, TIER.SUCCESS], // 裸骰非 12 时的 12 合计仍只是「成功」
  ]
  for (const [total, expected] of cases) {
    assert.equal(resolveTier(total, 7), expected, `合计 ${total} 应为 ${expected}`)
  }
})

test('check：大成功概率恒为 2.8%，与属性修正无关', () => {
  // 遍历所有 36 种骰面组合，统计每种修正下的大成功/大失败次数。
  for (const attr of [-3, -1, 0, 2, 5]) {
    let critSuccess = 0
    let critFail = 0
    for (let a = 1; a <= 6; a += 1) {
      for (let b = 1; b <= 6; b += 1) {
        const r = check({ attribute: attr }, createSequenceRng([a, b]))
        if (r.tier === TIER.CRITICAL_SUCCESS) critSuccess += 1
        if (r.tier === TIER.CRITICAL_FAILURE) critFail += 1
      }
    }
    assert.equal(critSuccess, 1, `属性 ${attr} 时大成功应恰好 1/36（裸骰 12）`)
    assert.equal(critFail, 1, `属性 ${attr} 时大失败应恰好 1/36（裸骰 2）`)
  }
})

test('check：总修正被 +5 天花板截断', () => {
  const r = check({
    attribute: 3,
    tag: 1,
    gear: 1,
    circumstance: 1,
    difficulty: 1,
  }, createSequenceRng([3, 3]))
  assert.equal(r.breakdown.sum, 7)
  assert.equal(r.breakdown.capped, true)
  // 合计 = 裸骰 6 + 截断后的 5 = 11
  assert.equal(r.total, 11)
})

test('check：标签修正超出 ±1 抛错', () => {
  assert.throws(() => check({ attribute: 0, tag: 2 }, createSequenceRng([1, 1])), /标签修正必须在/)
})

test('check：装备修正为负抛错', () => {
  assert.throws(() => check({ attribute: 0, gear: -1 }, createSequenceRng([1, 1])), /装备修正不可为负/)
})

test('validateBuild：合法分配通过', () => {
  assert.deepEqual(
    validateBuild({ 体魄: 0, 灵巧: 1, 心智: 2, 感知: 1, 交涉: 0, 意志: -1 }),
    { ok: true },
  )
})

test('validateBuild：非法分配被拒', () => {
  // 总和不对
  assert.equal(validateBuild({ 体魄: 2, 灵巧: 2, 心智: 2, 感知: 2, 交涉: 2, 意志: 2 }).ok, false)
  // 取值越界
  assert.equal(validateBuild({ 体魄: 3, 灵巧: 1, 心智: 0, 感知: 0, 交涉: 0, 意志: -1 }).ok, false)
  // 多重集不对（总和对，但分布不对）
  assert.equal(validateBuild({ 体魄: 1, 灵巧: 1, 心智: 1, 感知: 0, 交涉: 0, 意志: 0 }).ok, false)
})

test('maxHpFor / damageReductionFor：按 120 + 体魄×15 换算', () => {
  assert.equal(maxHpFor(0), 120)
  assert.equal(maxHpFor(2), 150)
  assert.equal(maxHpFor(-1), 105)
  assert.equal(damageReductionFor(2), 10)
  assert.equal(damageReductionFor(-1), -5)
})
