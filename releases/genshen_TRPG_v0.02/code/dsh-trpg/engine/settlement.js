/** 由已经结算的真实字段生成公开简报，供GM原样放在正文，不依赖展开工具JSON。 */
export function publicSettlement(result, input, state) {
  const parts = []
  const c = result.check
  if (c) {
    const b = c.breakdown
    parts.push(`${c.dice.join(' + ')}；${input.attribute ?? '灵巧'} ${signed(b.attribute)}，标签 ${signed(b.tag)}，装备 ${signed(b.gear)}，协助/处境 ${signed(b.circumstance)}，难度 ${signed(b.difficulty)}${b.capped ? '（总修正封顶+5）' : ''}＝${c.total}，${c.tierLabel}。`)
    if (result.damage) parts.push(`造成${result.damage.final}伤害；${result.target}剩余HP ${result.hp}。`)
    if (result.outcome) parts.push(`战斗结果：${result.outcome}。`)
    if (result.battleOver !== undefined && state.characters[input.actor]) {
      const a = state.characters[input.actor]
      parts.push(`${a.name} HP ${a.state.hp}/${a.state.max_hp}，元素能量${a.state.elemental_energy}/${a.state.max_elemental_energy}。`)
    }
    if (result.paidCost) parts.push(`已支付撤退代价：${result.paidCost.reason}${result.paidCost.quantity ? `，数量${result.paidCost.quantity}` : ''}。`)
  }
  // 场外裁定（trpg_apply）的 HP 变化必须出现在简报里：正文写受伤而数值没动，
  // 正是 2026-10-17 蒙德实机“伤势只存在于叙事”的成因。
  if (result.hpChange) {
    const h = result.hpChange
    const status = (result.after?.status ?? []).filter(x => x === '重伤')
    parts.push(`HP ${h.before}→${h.after}（上限${h.max}）${h.delta ? `，变化${signed(h.delta)}` : '，数值未变化'}${status.length ? '，已转为重伤' : ''}。`)
  } else if (result.after?.hp !== undefined && result.before?.hp !== undefined && result.after.hp !== result.before.hp) {
    parts.push(`HP ${result.before.hp}→${result.after.hp}。`)
  }
  for (const e of result.events ?? []) if (e.roll && e.target) {
    const name = state.characters[e.target]?.name ?? e.target
    parts.push(`敌方${e.actor ?? ''}：${e.roll.dice.join(' + ')}→${e.roll.roll}，目标${e.roll.targetNumber}，${e.roll.hit ? '命中' : '未命中'}；${name}受到${e.damage ?? 0}伤害${e.hp !== undefined ? `，HP ${e.hp}` : ''}${e.reaction ? `，${e.reaction}` : ''}。`)
  }
  if (result.transfer) parts.push(`已交给${result.transfer.recipient}：${result.transfer.name}×${result.transfer.quantity}；库存剩余${result.remaining}。`)
  return parts.length ? parts.join('\n') : null
}
function signed(n) { return n >= 0 ? `+${n}` : String(n) }
