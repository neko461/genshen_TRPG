import { startCombat, enemyAttackRoll, pickTarget, advanceRound } from './combat.js'
import { resolveDamage, findReaction, REACTIONS } from './damage.js'
import { applyDelta } from './character.js'
import { actorOf, activeScene, integer, requireValue as need, checkActor, living, heal, refreshAll } from './campaign.js'

const success = (r) => !['failure', 'critical_failure'].includes(r.tier)
export function battleOf(s) { need(s.battle && !s.battle.over, '没有正在进行的战斗'); return s.battle }
export function currentTurn(s) {
  const b = battleOf(s)
  return b.order[b.cursor]
}
export function requireTurn(s, id) {
  const t = currentTurn(s)
  need(t?.side === 'party' && t.id === id, `当前行动者是 ${t?.id ?? '未知'}，不是 ${id}`)
  const actor = actorOf(s, id)
  need(actor.state.hp > 0 && !actor.state.status.includes('重伤'), '该角色无法行动')
  return actor
}
function finish(s, outcome) {
  s.battle.over = true; s.battle.outcome = outcome
  for (const a of Object.values(s.characters)) {
    if (a.derived?.two === '沉沦之心') heal(a, 15)
    a.state.status = a.state.status.filter((x) => !['冻结', '结晶护盾'].includes(x))
    a.crystal = false; a.assist = false; a.pendingSupport = false
  }
}
function terminal(s) {
  if (!s.battle.enemies.some((e) => e.hp > 0)) { finish(s, 'victory'); return true }
  if (!Object.values(s.characters).some((a) => a.type === 'player' && a.state.hp > 0)) { finish(s, 'defeat'); return true }
  return false
}
export function endAction(s, actorId, { extra = false } = {}) {
  const b = s.battle
  if (terminal(s)) return
  b.acted[actorId] = (b.acted[actorId] ?? 0) + 1
  if (extra && b.acted[actorId] === 1) return
  b.cursor++
  skipInactive(s)
}
function skipInactive(s) {
  const b = s.battle
  while (!b.over && b.cursor < b.order.length) {
    const t = b.order[b.cursor]
    const alive = t.side === 'party' ? s.characters[t.id]?.state.hp > 0 && !s.characters[t.id].state.status.includes('重伤') : b.enemies.find((e) => e.id === t.id)?.hp > 0
    if (alive) return
    b.cursor++
  }
}
export function openBattle(s, input) {
  const scene = activeScene(s)
  need(!s.battle || s.battle.over, '已有战斗未结束')
  refreshAll(s)
  const pcs = Object.values(s.characters).filter((a) => a.type === 'player')
  need(s.mode === 'solo' ? pcs.length === 1 : pcs.length >= 3 && pcs.length <= 4, '单人须建 1 名玩家，多人须建 3–4 名玩家')
  need(pcs.every((a) => a.state.hp > 0 && !a.state.status.includes('重伤')), '有倒下或重伤玩家，先处理伤势')
  const party = living(s).map((a) => ({ id: a.id, name: a.name, initiative: a.derived.initiative }))
  need(Array.isArray(input.enemies) && input.enemies.length > 0, '请指定敌人')
  const allowed = new Set(['id', 'name', 'template', 'element'])
  for (const e of input.enemies) need(Object.keys(e).every((k) => allowed.has(k)), '试玩版敌人只接收 id/name/template/element，不接受外传 HP 或等级')
  const b = startCombat({ partyN: pcs.length, soloMode: s.mode === 'solo', party, enemies: input.enemies, phases: input.phases ?? 1 })
  const ids = new Set()
  for (const e of b.enemies) {
    need(!ids.has(e.id) && !s.characters[e.id], '敌人 id 重复或与角色冲突'); ids.add(e.id)
    e.effects = []; e.runtime = {}; e.reduction = e.mechanic === '护甲' ? 10 : 0
  }
  Object.assign(b, { id: `B${++s.battleSerial}`, cursor: 0, tick: 1, acted: {}, supportUsed: false, used: {}, roundEvents: [], history: [] })
  for (const a of living(s)) { a.stance = '攻击'; a.moved = false; a.guard = null; a.pendingSupport = false }
  scene.hadBattle = true
  s.world.safe = false
  s.battle = b
  skipInactive(s)
  return { battle: b }
}
export function playerAction(s, input, rng) {
  for (const forbidden of ['tier', 'targetHp', 'weaponDamage', 'weaponQuality', 'base', 'bonus', 'round']) need(input[forbidden] === undefined, `不接受调用方传入 ${forbidden}`)
  const actor = requireTurn(s, input.actor)
  need(actor.power?.status !== 'pending', '特殊能力角色尚待设定审核与玩家确认；拒绝行动')
  if (input.action === 'skill' || input.action === 'heal') need(actor.element, '角色没有已确认的元素能力，不能发动元素技或能量治疗')
  const b = s.battle
  const action = input.action ?? 'attack'
  actor.moved = input.move === true
  actor.stance = '攻击'
  const used = (key) => b.used[`${actor.id}:${key}`] === true
  const mark = (key) => { b.used[`${actor.id}:${key}`] = true }
  let result
  if (action === 'defend') {
    actor.stance = '防御'; result = { stance: '防御', targetBonus: 2 }
  } else if (action === 'switch') {
    need(actor.id === 'traveler', '仅旅行者可切换元素')
    need(actor.unlockedElements.includes(input.element), '尚未共鸣该元素')
    actor.element = input.element; result = { element: actor.element, note: '切换消耗整次行动' }
  } else if (action === 'assist') {
    const ally = actorOf(s, input.target); need(ally.id !== actor.id && ally.state.hp > 0, '协助须选另一名可行动队友')
    need(!ally.assist, '该队友已有待用协助'); ally.assist = true; result = { target: ally.id, assistance: 1 }
  } else if (action === 'retreat') {
    const roll = checkActor(actor, input, rng.d6)
    if (success(roll)) finish(s, 'retreated')
    result = { check: roll, note: success(roll) ? '队伍成功脱离' : '撤退失败，仍占一次行动；敌人按正常顺序行动' }
  } else if (action === 'heal') {
    need(!used('heal'), '每场战斗只能能量治疗一次')
    need(actor.state.elemental_energy >= 1, '元素能量不足')
    const ally = actorOf(s, input.target ?? actor.id)
    actor.state.elemental_energy--; mark('heal'); result = { healing: heal(ally, Math.floor(ally.state.max_hp * 0.2)) }
  } else if (action === 'transfer') {
    need(actor.derived.three === '流放者' && !used('transfer'), '需要流放者三件套且本战未使用')
    const ally = actorOf(s, input.target); need(ally.id !== actor.id && ally.state.hp > 0, '须选择另一名队友')
    mark('transfer'); result = { transfer: applyDelta(ally, { energy: 1 }) }
  } else if (action === 'guard') {
    need(actor.derived.three === '悠古的磐岩' && !used('guard'), '需要悠古的磐岩三件套且本战未使用')
    need(input.target !== actor.id && actorOf(s, input.target).state.hp > 0, '须保护另一名队友')
    actor.guard = input.target; mark('guard'); result = { guarded: input.target }
  } else {
    const target = b.enemies.find((e) => e.id === input.target)
    need(target && target.hp > 0, '须选择存活敌人 id')
    const rollInput = { ...input }
    if (actor.assist) { actor.pendingSupport = true; actor.assist = false }
    const roll = checkActor(actor, rollInput, rng.d6)
    if (action === 'interact') {
      const key = target.mechanic
      need(['护甲', '核心', '蓄力', '召唤', '锚点'].includes(key), '该敌人没有可拆解的机制')
      need(!target.runtime.interacted, '本场已破解该敌人的主机制，不能重复取消行动')
      if (success(roll)) {
        target.runtime.interacted = true
        if (key === '护甲') target.reduction = 0
        if (['核心', '锚点'].includes(key)) target.runtime.cancelSingle = true
        if (key === '核心') target.runtime.expose = b.tick + 1
        if (['蓄力', '召唤'].includes(key)) target.runtime.cancelAoe = true
      }
      result = { check: roll, mechanic: key, cleared: success(roll) }
    } else {
      need(['attack', 'skill'].includes(action), '未知战斗动作')
      let element = action === 'skill' || actor.derived.weapon.type === '法器' ? actor.element : null
      if (action === 'skill') {
        need(element, '没有可用元素')
        const free = ['学士', '沉沦之心'].includes(actor.derived.three) && !used('freeSkill')
        need(free || actor.state.elemental_energy >= 1, '元素能量不足')
        if (free) mark('freeSkill'); else actor.state.elemental_energy--
      }
      let attached = target.attached_element
      if (input.forceReaction) {
        const available = actor.derived.three === '翠绿之影' || actor.derived.weapon.trait === '元素亲和'
        need(action === 'skill' && available && !used('forceReaction'), '无视附着需要元素技及相应特效，每战一次')
        const def = REACTIONS.find((r) => r.name === input.forceReaction && r.pair.includes(element) && !r.pair.includes('*'))
        need(def, '该元素不能直接触发指定反应'); attached = def.pair.find((e) => e !== element); mark('forceReaction')
      }
      const reaction = success(roll) ? findReaction(element, attached) : null
      if (success(roll) && target.mechanic === '护甲' && (reaction || actor.derived.weapon.type === '双手剑')) target.reduction = 0
      let bonus = actor.derived.reactionBonus && reaction ? actor.derived.reactionBonus : 0
      if (actor.derived.three === '战狂' && actor.state.hp < actor.state.max_hp / 2) bonus += 20
      if (actor.derived.three === '角斗士的终幕礼' && !actor.moved) bonus += 20
      if (actor.derived.three === '角斗士的终幕礼' && roll.tier === 'critical_success') bonus += 30
      if (['草', '雷'].includes(element) && target.runtime.quicken) { bonus += 20; if (success(roll)) target.runtime.quicken = false }
      if (element === '火' && target.runtime.core) { bonus += 20; if (success(roll)) target.runtime.core = false }
      let damage = actor.derived.damage
      const out = resolveDamage({ weaponDamage: damage, bonusDamage: bonus, attackerElement: element, attachedElement: attached,
        targetReduction: target.runtime.expose >= b.tick ? 0 : target.reduction,
        catalystAffinity: actor.derived.weapon.trait === '元素亲和', firstRound: b.tick === 1, weaponTrait: actor.derived.weapon.trait, tier: roll.tier })
      if (b.tick === 1 && actor.derived.three === '如雷的盛怒' && b.acted[actor.id] === 1) {
        out.final = Math.floor(out.final / 2)
        out.notes.push('如雷的盛怒第二次攻击：最终伤害减半')
      }
      target.hp = Math.max(0, target.hp - out.final)
      if (success(roll)) {
        target.reduction = Math.max(-30, target.reduction + out.targetReductionDelta)
        target.attached_element = out.consumesAttached ? null : element && !['风', '岩'].includes(element) ? element : target.attached_element
        if (out.reaction === '冻结' && target.runtime.lastFrozen !== b.tick) { target.runtime.frozen = true; target.runtime.lastFrozen = b.tick }
        if (out.reaction === '结晶') actor.crystal = true
        if (out.reaction === '激化') target.runtime.quicken = true
        if (out.reaction === '绽放') target.runtime.core = true
        if (out.reaction === '扩散') for (const e of b.enemies) if (e.id !== target.id && e.hp > 0) e.attached_element = attached
        if (out.dot) target.effects = [{ type: out.reaction, turns: actor.derived.three === '翠绿之影' ? 3 : 2, damage: 10 }]
        if (target.runtime.expose) delete target.runtime.expose
      }
      if (action === 'skill' && actor.derived.three === '游医') heal(actor, Math.floor((actor.state.max_hp - actor.state.hp) * 0.2))
      result = { check: roll, damage: out, target: target.id, hp: target.hp }
    }
  }
  b.roundEvents.push({ actor: actor.id, action, result })
  if (!b.over) endAction(s, actor.id, { extra: b.tick === 1 && actor.derived.three === '如雷的盛怒' && ['attack', 'skill'].includes(action) })
  return { ...result, battleOver: b.over, outcome: b.outcome }
}

export function enemyAction(s, rng) {
  const turn = currentTurn(s); need(turn?.side === 'enemy', '当前不是敌人行动')
  const b = s.battle, e = b.enemies.find((enemy) => enemy.id === turn.id)
  const events = []
  const attacks = e.aoeEligible ? ['aoe', 'single'] : ['single']
  for (const kind of attacks) {
    if (terminal(s)) break
    if (e.runtime.frozen) { e.runtime.frozen = false; events.push({ kind, skipped: '冻结' }); continue }
    const cancel = kind === 'aoe' ? 'cancelAoe' : 'cancelSingle'
    if (e.runtime[cancel]) { e.runtime[cancel] = false; events.push({ kind, skipped: '机制已破解' }); continue }
    if (kind === 'aoe' && e.mechanic === '蓄力' && !e.runtime.charged) { e.runtime.charged = true; events.push({ kind, telegraph: '蓄力：下轮群攻，可打断或撤退' }); continue }
    if (kind === 'aoe' && e.mechanic === '蓄力') e.runtime.charged = false
    const candidates = living(s)
    if (!candidates.length) break
    const draw = kind === 'single' ? rng.random() : null
    const selection = kind === 'single' ? { ...pickTarget(candidates.map((a) => ({ id: a.id, threat: a.derived.threat })), () => draw), random: draw } : null
    const targets = selection ? [actorOf(s, selection.target.id)] : candidates
    for (const original of targets) {
      let target = original
      const guard = living(s).find((a) => a.guard === original.id)
      if (guard) { target = guard; guard.guard = null }
      const roll = enemyAttackRoll(e, { stance: target.stance, gearTargetBonus: target.crystal ? 1 : 0 }, rng.d6)
      if (roll.hit) {
        let reduction = target.derived.reduction + (guard ? 10 : 0)
        if (target.derived.weapon.trait === '拒马' && !target.moved) reduction += 15
        const remembrance = `${target.id}:remembrance`
        if (target.derived.three === '追忆之注连' && !b.used[remembrance]) { reduction += 15; b.used[remembrance] = true }
        let amount = Math.max(0, e[kind] - reduction)
        applyDelta(target, { hp: -amount, ...(e.element ? { attachedElement: e.element } : {}) })
        events.push({ kind, actor: e.id, target: target.id, selection, roll, damage: amount, hp: target.state.hp })
        target.crystal = false
      } else events.push({ kind, target: target.id, selection, roll, damage: 0 })
    }
  }
  b.roundEvents.push({ actor: e.id, events })
  if (!b.over) endAction(s, e.id)
  return { events, battleOver: b.over, outcome: b.outcome }
}

export function nextRound(s) {
  const b = battleOf(s)
  need(b.cursor >= b.order.length, '本轮还有未行动单位，不能跳过')
  for (const e of b.enemies) for (const dot of e.effects) if (dot.turns > 0 && e.hp > 0) {
    e.hp = Math.max(0, e.hp - dot.damage); dot.turns--; b.roundEvents.push({ dot: dot.type, target: e.id, damage: dot.damage, hp: e.hp })
  }
  b.history.push({ tick: b.tick, events: b.roundEvents }); b.roundEvents = []
  if (terminal(s)) return { over: true, outcome: b.outcome }
  const result = advanceRound(b)
  if (result.over) finish(s, result.outcome)
  else {
    b.tick++; b.cursor = 0; b.acted = {}
    for (const a of Object.values(s.characters)) { a.stance = '攻击'; a.moved = false }
    skipInactive(s)
  }
  return result
}
