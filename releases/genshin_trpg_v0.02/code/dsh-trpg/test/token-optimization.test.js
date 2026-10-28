import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Runtime } from '../engine/runtime.js'
import { createTools } from '../lib/tools.js'
import { createCharacter } from '../engine/character.js'
import { deriveStats, refreshStats } from '../engine/stats.js'
import { makeArtifact, ARTIFACT_SETS } from '../engine/gear.js'
import { BUILD_SCHEMES } from '../engine/rules.js'
import { startCombat } from '../engine/combat.js'

test('按主题查询与完整规则一致，不创建存档；未知主题拒绝', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-scope-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runtime = new Runtime({ root })
  const read = input => runtime.execute({ tool: 'trpg_rules', mode: 'solo', slot: 'test', input })
  const all = read({})
  assert.deepEqual(read({ scope: 'all' }), all)
  for (const [scope, keys] of Object.entries({ creation: ['schemes'], checks: ['caps', 'difficulty'], combat: ['enemies', 'independentSolo', 'maxPositiveReductionRatio'], equipment: ['artifactSets', 'weapons'], recovery: ['recovery'] })) {
    assert.deepEqual(read({ scope }), Object.fromEntries(['version', ...keys].map(key => [key, all[key]])))
  }
  assert.throws(() => read({ scope: 'missing' }), /scope/)
  assert.deepEqual(fs.readdirSync(root), [])
})

test('紧凑输出保留骰子与结算对象，中文和换行可无损解析', () => {
  const tool = createTools({ root: os.tmpdir() }).find(x => x.name === 'trpg_check')
  const value = { check: { dice: [2, 6], total: 11 }, publicSummary: '检定成功\n已结算', state: { revision: 3, notes: ['含有"引号"'] } }
  const output = tool.output.render({}, value)
  assert.deepEqual(JSON.parse(output[0].text), value)
  assert.ok(output[0].text.length < JSON.stringify(value, null, 2).length)
})

test('生命套装说明与真实派生值一致，装备不赠送治疗', () => {
  for (const set of ['冒险家', '追忆之注连']) {
    const actor = createCharacter({ id: 'pc', weapon: '单手剑', attributes: { ...BUILD_SCHEMES.均衡, 体魄: 0 } })
    actor.gear = { artifacts: Object.fromEntries(['生之花', '死之羽'].map(slot => [slot, makeArtifact({ set, slot, quality: 3 })])) }
    assert.equal(deriveStats(actor).hp, 140)
    assert.equal(ARTIFACT_SETS[set].two, '生命值上限提升 10 点')
    const before = actor.state.hp
    refreshStats(actor)
    assert.equal(actor.state.hp, before)
  }
})

test('单人普通遭遇限制与独行首领例外并存', () => {
  const enemies = n => Array.from({ length: n }, () => ({ threat: 1 }))
  assert.equal(startCombat({ soloMode: true, enemies: enemies(2) }).encounter.budget, 2)
  assert.throws(() => startCombat({ soloMode: true, enemies: enemies(3) }), /最多/)
  assert.equal(startCombat({ soloMode: true, enemies: [{ threat: 3 }] }).encounter.budget, 4)
  assert.throws(() => startCombat({ soloMode: true, enemies: [{ threat: 3 }, { threat: 1 }] }), /首领/)
})

