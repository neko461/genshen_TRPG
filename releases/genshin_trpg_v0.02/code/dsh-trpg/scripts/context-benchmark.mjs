import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createTools } from '../lib/tools.js'
import { Runtime } from '../engine/runtime.js'

// Isolated fixture only. Never read, advance or overwrite the user's game slots.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-context-benchmark-'))
try {
  const runtime = new Runtime({ root, d6Source: () => 4 })
  const tools = createTools({ root, d6Source: () => 4 })
  let serial = 0
  const call = (tool, input) => runtime.execute({ tool, input, mode: 'solo', slot: 'benchmark', requestId: `bench_${++serial}` })
  const rendered = (name, value) => tools.find(tool => tool.name === name).output.render({}, value)[0].text
  const measure = (name, value) => {
    const { delta, ...legacy } = value
    return { completeCompactChars: JSON.stringify(legacy).length, modelChars: rendered(name, value).length }
  }
  const args = { mode: 'solo', slot: 'benchmark', input: { op: 'opening' } }
  const char = tools.find(tool => tool.name === 'trpg_char')
  const fullOpening = char.execute({ ...args, input: { ...args.input, profile: 'full' } })
  const stagedOpening = char.execute(args)
  call('trpg_save', { op: 'demo' })
  const fresh = measure('trpg_save', call('trpg_save', { op: 'load' }))
  let narrative
  for (let i = 0; i < 35; i++) narrative = call('trpg_narrate', { text: `第${i + 1}次记录：` + '林川观察街口的风向，收起纸笔，继续沿城墙前往骑士团。'.repeat(20) })
  const narrate = measure('trpg_narrate', narrative)
  call('trpg_scene', { op: 'open', goal: '保护通道', location: '城外' })
  const start = call('trpg_combat', { op: 'start', enemies: [{ template: '丘丘暴徒' }] })
  const battle = [measure('trpg_combat', start)]
  let state = start.state
  for (let i = 0; i < 30 && !state.battle.over; i++) {
    const turn = state.battle.order[state.battle.cursor]
    const tool = !turn ? 'trpg_combat_advance' : turn.side === 'enemy' ? 'trpg_combat' : 'trpg_combat_attack'
    const input = !turn ? {} : turn.side === 'enemy' ? { op: 'enemy' }
      : { actor: turn.id, action: 'attack', target: state.battle.enemies.find(enemy => enemy.hp > 0).id }
    const result = call(tool, input)
    battle.push(measure(tool, result))
    state = result.state
  }
  console.log(JSON.stringify({ unit: 'JavaScript string characters, not model tokens',
    opening: { fullChars: JSON.stringify(fullOpening).length, stagedChars: JSON.stringify(stagedOpening).length },
    freshLoad: fresh, longNarrate: narrate, battleCalls: battle.length,
    battleTotal: battle.reduce((sum, item) => ({ completeCompactChars: sum.completeCompactChars + item.completeCompactChars, modelChars: sum.modelChars + item.modelChars }), { completeCompactChars: 0, modelChars: 0 }),
    finalBattle: battle.at(-1),
  }, null, 2))
} finally { fs.rmSync(root, { recursive: true, force: true }) }
