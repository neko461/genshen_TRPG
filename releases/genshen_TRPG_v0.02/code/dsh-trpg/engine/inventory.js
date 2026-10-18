import { safeId } from './journal.js'
import { actorOf, activeScene, outsideBattle, integer, nonempty, requireValue as need, heal, refreshAll } from './campaign.js'
import { makeArtifact, upgradeArtifact, ARTIFACT_SETS } from './gear.js'
import { requireTurn, endAction } from './battle.js'
import { WEAPONS } from './rules.js'
import { sceneCharacters, battleCharacters } from './participation.js'

export const ITEM_TYPES = ['料理', '药剂', '绷带', '机关材料', '圣遗物', '武器']
export function grantItem(s, item) {
  const id = safeId(item.id, '物品编号')
  need(ITEM_TYPES.includes(item.type), '未知物品类型')
  const quantity = integer(item.quantity ?? 1, 1, 10, '数量')
  if (['圣遗物', '武器'].includes(item.type)) need(quantity === 1 && !Object.hasOwn(s.inventory, id), '装备逐件使用唯一编号，不能叠成同一库存项')
  let data = { id, name: nonempty(item.name ?? item.type, '物品名称', 60), type: item.type, quantity }
  if (item.type === '圣遗物') data = { ...data, ...makeArtifact({ set: item.set, slot: item.slot, quality: item.quality ?? 1 }) }
  if (item.type === '武器') {
    need(Object.hasOwn(WEAPONS, item.weaponType), '未知武器类型')
    data.weaponType = item.weaponType; data.quality = integer(item.quality ?? 1, 1, 5, '品质')
  }
  if ((data.quality ?? 1) >= 4) {
    need(['遗迹', '馈赠'].includes(item.source), '四星以上仅可来自遗迹或馈赠')
    need(item.costFlag && s.world.flags[item.costFlag] === true, '四星以上须已记录不可逆代价旗标')
  }
  const old = s.inventory[id]
  if (old) {
    const same = (x) => JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'quantity')))
    need(same(old) === same(data), '同一物品编号不能改名或变类型')
    old.quantity += quantity
  } else s.inventory[id] = data
  return s.inventory[id]
}
export function takeItem(s, id, count = 1) {
  safeId(id, '物品编号')
  integer(count, 1, 1000, '移出数量')
  const item = s.inventory[id]
  need(item && item.quantity >= count, '物品不足或不存在')
  item.quantity -= count
  return item
}
/** 转交只减少共享库存，不冒充使用/治疗，也不要求给叙事NPC创建角色卡。 */
export function transferItem(s, input) {
  outsideBattle(s)
  const recipient = nonempty(input.recipient, '接收者', 120)
  need(!Object.values(s.characters).some(a => a.id === recipient || a.name === recipient), '队内物品为共享库存，无须转交；此操作仅用于交给队外接收者')
  const reason = nonempty(input.reason, '转交依据')
  const quantity = integer(input.quantity ?? 1, 1, 1000, '转交数量')
  const item = takeItem(s, input.item, quantity)
  return { transfer: { item: item.id, name: item.name, quantity, recipient, reason }, remaining: item.quantity }
}
export function useItem(s, input) {
  const scene = activeScene(s)
  const actor = actorOf(s, input.actor)
  const battle = s.battle && !s.battle.over
  if (battle) requireTurn(s, actor.id)
  const target = actorOf(s, input.target ?? actor.id)
  const participants = battle ? battleCharacters(s) : sceneCharacters(s)
  need(participants.some(a => a.id === actor.id) && participants.some(a => a.id === target.id), '物品使用者和目标须在当前场景或战斗')
  const item = s.inventory[input.item]
  need(item && item.quantity > 0, '物品不足')
  const usage = scene.itemUses ??= {}
  let result
  if (['料理', '药剂'].includes(item.type)) {
    need(!usage[target.id], '该角色本场景已使用料理或药剂')
    need(battle ? item.type === '药剂' : item.type === '料理', battle ? '战斗中只能用药剂，并消耗行动' : '战斗外请使用料理')
    usage[target.id] = true; takeItem(s, item.id)
    result = heal(target, Math.floor(target.state.max_hp * 0.15))
  } else if (item.type === '绷带') {
    need(!battle && s.world.safe, '绷带须在安全非战斗场景使用')
    const i = target.state.status.findIndex((x) => ['冻结', '迟缓', '灼伤', '中毒'].includes(x))
    need(i >= 0, '没有可用绷带移除的普通状态'); result = { removed: target.state.status.splice(i, 1)[0] }; takeItem(s, item.id)
  } else throw new Error('该物品不能直接使用')
  if (battle) endAction(s, actor.id)
  return { result, remaining: item.quantity }
}
export function equipItem(s, input) {
  outsideBattle(s)
  const actor = actorOf(s, input.actor); need(actor.type === 'player', '旅行者装备由玩家卡动态跟随')
  const item = s.inventory[input.item]; need(item?.quantity > 0, '物品不足')
  need(['武器', '圣遗物'].includes(item.type), '不是可装备物品')
  const key = item.type === '武器' ? 'weapon' : item.slot
  const old = key === 'weapon' ? actor.gear.weapon : actor.gear.artifacts[key]
  takeItem(s, item.id)
  if (old?.itemId) s.inventory[old.itemId].quantity++
  const gear = item.type === '武器' ? { type: item.weaponType, quality: item.quality, itemId: item.id } : { ...item, itemId: item.id, quantity: undefined }
  if (key === 'weapon') actor.gear.weapon = gear
  else actor.gear.artifacts[key] = gear
  refreshAll(s)
  return { actor, equipped: gear }
}
export function upgrade(s, input) {
  outsideBattle(s); need(s.world.safe, '强化须在安全地点')
  const actor = actorOf(s, input.actor)
  const artifact = actor.gear.artifacts[input.slot]
  need(artifact, '该槽位未装备圣遗物'); need(s.supplies >= 1, '补给不足')
  const material = s.inventory[input.material]
  need(material?.type === '圣遗物' && material.quantity >= 1 && material.quality >= artifact.quality, '需要一件同品质或更高的圣遗物材料')
  if (artifact.upgrade === 3) need(material.set === artifact.set && material.slot === artifact.slot, '+4 需要同套装、同槽位材料')
  const result = upgradeArtifact(artifact, true); need(result.ok, result.reason)
  takeItem(s, material.id); s.supplies--; actor.gear.artifacts[input.slot] = result.artifact
  if (artifact.itemId) s.inventory[artifact.itemId].upgrade = result.artifact.upgrade
  refreshAll(s)
  return { artifact: result.artifact, supplies: s.supplies, actor }
}
