'use strict'
const $ = (id) => document.getElementById(id)
let state = null, config = null, busy = false, activeSlot = null
const names = { victory: '胜利：找回通往货箱的道路。', defeat: '战败：转入重伤与救援剧情，不判定死亡。', stalemate: '局势转折：到达轮次上限，本场结束。', retreated: '队伍成功撤退。' }
function notice(text) { $('notice').textContent = text }
function summary(r) {
  const lines = []
  if (r.check) lines.push(`${r.check.tierLabel}：骰面 [${r.check.dice.join('、')}]，合计 ${r.check.total}。`)
  if (r.damage) lines.push(`造成 ${r.damage.final} 点伤害${r.damage.reaction ? `，触发${r.damage.reaction}` : ''}，目标剩余 HP ${r.hp}。`)
  for (const event of r.events ?? []) {
    if (event.skipped) lines.push(`因${event.skipped}，敌人的一次${event.kind === 'aoe' ? '群攻' : '单体攻击'}取消。`)
    else if (event.telegraph) lines.push(event.telegraph)
    else lines.push(`${state?.characters[event.target]?.name ?? event.target}：敌人骰面 [${event.roll?.dice?.join('、')}]，${event.roll?.hit ? `命中，受到 ${event.damage} 点伤害` : '未命中'}。`)
  }
  if (r.recovery) for (const row of r.recovery) lines.push(`${state?.characters[row.actor]?.name ?? row.actor}：恢复 ${row.healed ?? 0} HP${row.energyRestored ? `，${row.energyRestored} 点能量` : ''}。`)
  if (r.outcome && names[r.outcome]) lines.push(names[r.outcome])
  if (r.note) lines.push(r.note)
  if (r.valid) lines.push(`存档校验通过，共 ${r.events} 笔事件。`)
  return lines.join('\n') || '操作已完成并记录。可展开完整结果核对。'
}
async function call(tool, input = {}, options = {}) {
  if (!config) throw new Error('服务尚未连接')
  const packet = { tool, mode: 'solo', slot: activeSlot ?? $('slot').value.trim(), input, requestId: crypto.randomUUID() }
  if (state && !options.create) packet.expectedRevision = state.revision
  const response = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TRPG-Token': config.token }, body: JSON.stringify(packet) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? '请求失败')
  const r = data.result
  if (r.state) { state = r.state; activeSlot = state.slot; localStorage.setItem('trpg_test_slot', activeSlot); render() }
  $('raw').textContent = JSON.stringify(r, null, 2)
  $('result').textContent = summary(r)
  notice(r.warning ?? '已保存。你可以继续操作，也可以关闭页面后读档。')
  return r
}
function bind(id, fn) {
  $(id).addEventListener('click', async () => {
    if (busy) return
    busy = true; renderControls()
    try { await fn() } catch (e) { notice(`未执行：${e.message}`) }
    finally { busy = false; renderControls() }
  })
}
function card(name, hp, max, detail) {
  const div = document.createElement('div'); div.className = 'card'
  const title = document.createElement('strong'); title.textContent = name; div.append(title)
  const bar = document.createElement('div'); bar.className = 'bar'
  const fill = document.createElement('div'); fill.className = 'bar-fill'; fill.style.width = `${Math.max(0, Math.min(100, hp / max * 100))}%`; bar.append(fill); div.append(bar)
  const text = document.createElement('div'); text.textContent = `HP ${hp} / ${max}`; div.append(text)
  const p = document.createElement('small'); p.textContent = detail; div.append(p)
  return div
}
function turn() { return state?.battle && !state.battle.over ? state.battle.order[state.battle.cursor] : null }
function renderControls() {
  for (const button of document.querySelectorAll('button')) button.disabled = busy || !config
  if (!state) return
  const b = state.battle, t = turn(), fighting = b && !b.over
  for (const button of document.querySelectorAll('[data-action]')) button.disabled = busy || !fighting || t?.side !== 'party'
  $('enemy').disabled = busy || !fighting || t?.side !== 'enemy'
  $('advance').disabled = busy || !fighting || b.cursor < b.order.length
  for (const id of ['open', 'check', 'start-battle', 'close', 'return', 'camp', 'rest', 'equip', 'upgrade', 'food', 'buy', 'reward']) $(id).disabled = busy || Boolean(fighting)
  $('slot').disabled = true
}
function render() {
  $('game').hidden = false
  $('campaign').textContent = `${state.title} · ${state.slot}`
  $('world').textContent = `${state.timeline.name} / ${state.world.location} · 第 ${state.world.day} 日 · ${state.world.safe ? '安全' : '野外或危险'} · 已保存 ${state.revision} 笔事件`
  $('characters').replaceChildren(...Object.values(state.characters).map((a) => card(a.name, a.state.hp, a.state.max_hp,
    `${a.element} · 能量 ${a.state.elemental_energy}/${a.state.max_elemental_energy} · 伤害 ${a.derived.damage} · 先攻 ${a.derived.initiative}${a.state.status.length ? ` · ${a.state.status.join('、')}` : ''}`)))
  const b = state.battle, t = turn()
  $('scene-state').textContent = state.scene ? `${state.scene.goal} · 检定 ${state.scene.checks.length}/3 · ${state.scene.closed ? '已结束' : '进行中'}` : '尚未开始场景。'
  $('turn').textContent = !b ? '尚未进入战斗' : b.over ? names[b.outcome] ?? '本场结束' : `阶段 ${b.phase} / 第 ${b.round} 轮 · ${t ? `轮到 ${state.characters[t.id]?.name ?? b.enemies.find((e) => e.id === t.id)?.name}` : '全员行动完毕，请结束本轮'}`
  $('enemies').replaceChildren(...(b?.enemies ?? []).map((e) => card(e.name, e.hp, e.max_hp, `${e.mechanic} · ${e.element ?? '物理'}${e.attached_element ? ` · 附着${e.attached_element}` : ''}${e.runtime?.frozen ? ' · 冻结' : ''}`)))
  const selected = $('target').value
  $('target').replaceChildren(...(b?.enemies ?? []).filter((e) => e.hp > 0).map((e) => { const o = document.createElement('option'); o.value = e.id; o.textContent = `${e.name}（${e.hp} HP）`; return o }))
  if ([...$('target').options].some((o) => o.value === selected)) $('target').value = selected
  $('supplies').textContent = `共享补给 ${state.supplies} / 6 格`
  $('inventory').replaceChildren(...Object.values(state.inventory).filter((i) => i.quantity > 0).map((i) => { const li = document.createElement('li'); li.textContent = `${i.name}${i.set ? ` · ${i.set} ${i.slot} ★${i.quality}` : ''} × ${i.quantity}`; return li }))
  renderControls()
}
bind('new', async () => { state = null; activeSlot = null; await call('trpg_save', { op: 'demo', title: '蒙德·遗失的货箱', name: $('name').value, element: $('element').value }, { create: true }) })
bind('load', () => call('trpg_save', { op: 'load' }))
bind('switch-slot', async () => {
  state = null; activeSlot = null; $('game').hidden = true; $('slot').disabled = false
  $('slot').value = `first_test_${Date.now().toString(36)}`
  notice('原存档完整保留。可使用新名字创建测试档，或填回原名继续。')
  $('slot').focus()
})
bind('refresh', () => call('trpg_save', { op: 'load' }))
bind('verify', () => call('trpg_save', { op: 'verify' }))
bind('open', () => call('trpg_scene', { op: 'open', goal: '调查车辙并找回协会货箱', location: '蒙德城外·旧车道', safe: false }))
bind('check', () => call('trpg_scene', { op: 'check', actor: 'pc', attribute: '灵巧', tag: '野外追踪', purpose: '追踪货车车辙与脚印', unlockFlag: 'road_clue' }))
bind('lore', async () => { const r = await call('trpg_lore', { query: '货箱' }); $('clue').textContent = r.hits.map((h) => h.text).join('\n') || `${r.notice} 即使暂时没看清足迹，也可继续观察瞭望台，承担剧情代价。` })
bind('start-battle', () => call('trpg_combat', { op: 'start', enemies: [{ id: 'guard_a', name: '丘丘人' }, { id: 'guard_b', name: '丘丘射手' }] }))
for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', async () => {
    if (busy) return
    busy = true; renderControls()
    try {
      const t = turn(); if (t?.side !== 'party') throw new Error('尚未轮到我方行动')
      const action = button.dataset.action
      await call('trpg_combat', { op: 'act', actor: t.id, action, target: action === 'heal' ? t.id : $('target').value, attribute: '灵巧' })
    } catch (e) { notice(`未执行：${e.message}`) } finally { busy = false; renderControls() }
  })
}
bind('enemy', () => call('trpg_combat', { op: 'enemy' }))
bind('advance', () => call('trpg_combat', { op: 'advance' }))
bind('equip', () => call('trpg_gear', { op: 'equip', actor: 'pc', item: 'flower' }))
bind('upgrade', () => call('trpg_gear', { op: 'upgrade', actor: 'pc', slot: '生之花', material: 'material' }))
bind('food', () => call('trpg_item', { op: 'use', actor: 'pc', item: 'food' }))
bind('potion', () => { const t = turn(); return call('trpg_item', { op: 'use', actor: t?.side === 'party' ? t.id : 'pc', item: 'potion' }) })
bind('buy', () => call('trpg_item', { op: 'buy', type: '料理' }))
bind('close', () => call('trpg_scene', { op: 'close', summary: '完成对车道和瞭望台的调查' }))
bind('return', () => call('trpg_state', { op: 'set', location: '蒙德城·冒险家协会', safe: true, reason: '脱离战斗后，沿已知车道返回蒙德城' }))
bind('camp', () => call('trpg_recover', { level: '扎营' }))
bind('rest', () => call('trpg_recover', { level: '休整', reason: '回到安全协会驻地，完整休整到次日' }))
bind('reward', async () => { if (state?.battle?.outcome !== 'victory') throw new Error('先完成瞭望台遭遇并找回货箱'); await call('trpg_item', { op: 'reward', sourceId: 'tutorial_cargo', reason: '成功击退守卫并交回协会货箱' }) })
bind('save-feedback', () => call('trpg_narrate', { text: `首测反馈：${$('feedback').value.trim() || '暂无补充'}` }))
bind('export', async () => {
  const result = await call('trpg_save', { op: 'export', limit: 100 })
  const blob = new Blob([JSON.stringify({ version: 'genshen_TRPG_v0.01', exportedAt: new Date().toISOString(), ...result }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `TRPG首测-${state.slot}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
})
async function boot() {
  try {
    config = await (await fetch('/api/config')).json()
    $('slot').value = localStorage.getItem('trpg_test_slot') || 'first_test'
    notice('已连接本机服务。新建测试档，或继续已有存档。')
  } catch { notice('未连接服务，请先双击“启动首轮测试.cmd”。') }
  renderControls()
}
boot()
