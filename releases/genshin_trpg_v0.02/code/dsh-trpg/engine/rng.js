/**
 * 随机数源。
 *
 * 设计原则：
 * - 生产环境用 `node:crypto` 的强随机，保证骰点公平。
 * - 测试环境可注入确定性替换源（`createSequenceRng`），使每个档位边界都能精确断言。
 * - 不使用可复现种子重放整场——骰面与全部参数会写进 events.jsonl，需要复算时用日志里的参数即可。
 */

import { randomInt } from 'node:crypto'

/** 一个 6 面骰的骰面数。 */
export const DIE_FACES = 6

/**
 * 强随机 d6，返回 1..6。
 * @returns {number}
 */
export function d6() {
  return randomInt(1, DIE_FACES + 1)
}

/**
 * 掷 `count` 个 d6。
 * @param {number} count - 骰子数量。
 * @returns {number[]} 骰面数组，顺序即掷出顺序。
 */
export function rollDice(count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`rollDice: count 必须是非负整数，收到 ${count}`)
  }
  const out = []
  for (let i = 0; i < count; i += 1) out.push(d6())
  return out
}

/**
 * 创建一个确定性随机源，按给定序列产出。
 *
 * 序列耗尽后抛错——这能在测试里暴露「实际掷骰次数与预期不符」的问题，
 * 而不是静默地重复使用最后一个值。
 *
 * @param {number[]} values - 依次产出的骰面（每个应为 1..6）。
 * @returns {() => number} 一个 d6 形态的函数。
 */
export function createSequenceRng(values) {
  let i = 0
  return () => {
    if (i >= values.length) {
      throw new Error(`createSequenceRng: 序列已耗尽（共 ${values.length} 个骰面）`)
    }
    const v = values[i]
    i += 1
    if (!Number.isInteger(v) || v < 1 || v > DIE_FACES) {
      throw new Error(`createSequenceRng: 第 ${i} 个骰面非法：${v}`)
    }
    return v
  }
}

/**
 * 用一个 d6 形态的函数掷 `count` 个骰。
 * @param {number} count - 骰子数量。
 * @param {() => number} rng - 返回 1..6 的函数。
 * @returns {number[]}
 */
export function rollDiceWith(count, rng) {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`rollDiceWith: count 必须是非负整数，收到 ${count}`)
  }
  const out = []
  for (let i = 0; i < count; i += 1) out.push(rng())
  return out
}
