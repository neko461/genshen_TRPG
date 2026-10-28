const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)))

export function battleView(battle) {
  if (!battle) return battle
  return { ...omit(battle, ['history', 'roundEvents']), currentTurn: battle.over ? null : battle.order?.[battle.cursor] ?? null }
}

function currentState(state) {
  return {
    mode: state.mode, slot: state.slot, revision: state.revision, timeline: state.timeline,
    location: state.world.location, day: state.world.day, safe: state.world.safe, supplies: state.supplies,
    characters: Object.fromEntries(Object.entries(state.characters).map(([id, actor]) => [id, {
      name: actor.name, type: actor.type, element: actor.element, state: actor.state,
      stance: actor.stance, assist: actor.assist, pendingSupport: actor.pendingSupport,
    }])),
    party: state.party, support: state.support,
    scene: state.scene ? { ...omit(state.scene, ['checks']), checkCount: state.scene.checks.length } : null,
    battle: battleView(state.battle),
  }
}

/** Render only. The Runtime value, journal and HTTP/full-state callers remain authoritative. */
export function modelOutput(tool, args, value) {
  if (args.view === 'full' || !value?.delta || !value.state || value.replayed) return value
  const result = { ...omit(value, ['state']), view: 'trpg-model-v1', stateComplete: false, current: currentState(value.state),
    recovery: '增量基于delta.baseRevision；上下文缺失、版本断档或不确定时先trpg_save load恢复完整状态，不猜测事实。' }
  if (result.battle) delete result.battle // same current battle is already present in current.battle
  if (result.scene) result.scene = { ...omit(result.scene, ['checks']), checkCount: result.scene.checks.length }
  return result
}
