import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeArtifact, artifactBonus, resolveArtifactSet } from '../engine/gear.js'
import { createCharacter, recover } from '../engine/character.js'
import { BUILD_SCHEMES, RECOVERY } from '../engine/rules.js'

test('一星遗物只占位，混搭不会偷偷获得基础 HP 或套效', () => {
  const flower = makeArtifact({ set: '冒险家', slot: '生之花', quality: 1 })
  const crown = makeArtifact({ set: '冒险家', slot: '理之冠', quality: 1 })
  assert.deepEqual(artifactBonus(flower), {})
  const set = resolveArtifactSet([flower, crown])
  assert.deepEqual(set.totals, {})
  assert.equal(set.activeTwo, null)
})

test('强化不放大或抹去先攻、仇恨、能量与比例，HP 仍增长', () => {
  for (const [set, key, expected] of [
    ['如雷的盛怒', 'initiative', 2], ['悠古的磐岩', 'threat', 0.5],
    ['流放者', 'energyMax', 1], ['游医', 'healingBonus', 0.2],
  ]) {
    for (const upgrade of [1, 4]) {
      const a = makeArtifact({ set, slot: '理之冠', quality: 5, upgrade })
      assert.equal(artifactBonus(a)[key], expected)
    }
  }
  assert.equal(artifactBonus(makeArtifact({ set: '冒险家', slot: '生之花', quality: 5, upgrade: 4 })).hp, 20)
})

test('恢复返回实际治疗量，扎营回能但不清重伤', () => {
  const c = createCharacter({ id: 'pc', attributes: BUILD_SCHEMES.均衡 })
  c.state.hp -= 3
  c.state.elemental_energy = 0
  c.state.status = ['冻结', '重伤']
  const r = recover(c, '扎营', RECOVERY)
  assert.equal(r.healed, 3)
  assert.equal(r.energyRestored, 3)
  assert.equal(c.state.hp, c.state.max_hp)
  assert.deepEqual(c.state.status, ['重伤'])
  assert.equal(recover(c, '扎营', RECOVERY).healed, 0)
})

test('短休不冒充场景回能；安全休整才另行补满能量', () => {
  const c = createCharacter({ id: 'pc', attributes: BUILD_SCHEMES.均衡 })
  c.state.elemental_energy = 1
  c.state.hp = 80
  const short = recover(c, '短休', RECOVERY)
  assert.equal(short.healed, 12)
  assert.equal(short.energyRestored, 0)
  assert.equal(c.state.elemental_energy, 1)
  assert.equal(recover(c, '休整', RECOVERY).energyRestored, 2)
})
