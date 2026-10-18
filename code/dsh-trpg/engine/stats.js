import { resolveArtifactSet, weaponStats } from './gear.js'
import { maxHpFor } from './rules.js'

export function deriveStats(actor) {
  const gear = actor.gear ?? { artifacts: {} }
  const set = resolveArtifactSet(Object.values(gear.artifacts ?? {}).filter(Boolean))
  const totals = { ...set.totals }
  const two = {
    冒险家: { hp: 30 }, 幸运儿: { reduction: 10 }, 游医: { healingBonus: 0.2 }, 学士: { reactionBonus: 15 },
    战狂: { damage: 10 }, 流放者: { energyMax: 1 }, 角斗士的终幕礼: { damage: 15 }, 追忆之注连: { hp: 30 },
    翠绿之影: { reactionBonus: 15 }, 如雷的盛怒: { initiative: 2 }, 悠古的磐岩: { threat: 0.5 },
  }[set.activeTwo] ?? {}
  for (const [k, v] of Object.entries(two)) totals[k] = (totals[k] ?? 0) + v
  const weapon = weaponStats(gear.weapon?.type ?? actor.weapon ?? '单手剑', gear.weapon?.quality ?? 1)
  const result = {
    hp: maxHpFor(actor.attributes.体魄) + (totals.hp ?? 0), energy: 3 + (totals.energyMax ?? 0),
    damage: weapon.damage + (totals.damage ?? 0), reduction: actor.attributes.体魄 * 5 + weapon.reduction + (totals.reduction ?? 0),
    initiative: actor.attributes.感知 + weapon.initiative + (totals.initiative ?? 0),
    threat: weapon.threat + (totals.threat ?? 0), reactionBonus: totals.reactionBonus ?? 0,
    healingBonus: totals.healingBonus ?? 0, two: set.activeTwo, three: set.activeThree, weapon,
  }
  if (result.three === '沉沦之心') result.energy++
  return result
}

export function refreshStats(actor) {
  const stats = deriveStats(actor)
  actor.state.max_hp = stats.hp
  actor.state.max_elemental_energy = stats.energy
  actor.state.hp = Math.min(actor.state.hp, stats.hp)
  actor.state.elemental_energy = Math.min(actor.state.elemental_energy, stats.energy)
  actor.derived = stats
  return stats
}

export function syncTraveler(state) {
  if (state.mode !== 'solo') return
  const pc = Object.values(state.characters).find((a) => a.type === 'player')
  if (!pc) return
  const old = state.characters.traveler
  if (!old && !state.party?.traveler?.met) return
  const stats = deriveStats(pc)
  const hp = Math.max(5, Math.floor(stats.hp * 0.8 / 5) * 5)
  const traveler = old ?? structuredClone(pc)
  Object.assign(traveler, { id: 'traveler', type: 'companion', name: '旅行者', attributes: { ...pc.attributes }, tags: [], relations: old?.relations ?? {}, unlockedElements: old?.unlockedElements ?? ['风'] })
  traveler.element = old?.element ?? '风'
  traveler.vision = false
  traveler.power = { type: 'traveler', status: 'approved', source: '旅行者既有共鸣规则' }
  traveler.state.max_hp = hp
  traveler.state.hp = old ? Math.min(old.state.hp, hp) : hp
  traveler.state.max_elemental_energy = 3
  traveler.state.elemental_energy = old?.state.elemental_energy ?? 3
  traveler.derived = { ...stats, hp, energy: 3, damage: Math.max(5, Math.floor(stats.damage * 0.8 / 5) * 5), reduction: Math.floor(stats.reduction * 0.8 / 5) * 5, initiative: Math.max(0, stats.initiative - 1), threat: 1.2, two: null, three: null, reactionBonus: 0, healingBonus: 0, weapon: { ...stats.weapon, trait: null } }
  state.characters.traveler = traveler
}
