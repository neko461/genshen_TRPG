import { isDeepStrictEqual } from 'node:util'

// The wire state contains JSON only; undefined fields are not part of the contract.
export const wireState = value => JSON.parse(JSON.stringify(value))

export function stateDelta(before, after) {
  const operations = []
  function visit(a, b, path) {
    if (isDeepStrictEqual(a, b)) return
    if (Array.isArray(a) && Array.isArray(b)) {
      let start = 0, end = 0
      while (start < Math.min(a.length, b.length) && isDeepStrictEqual(a[start], b[start])) start++
      while (end < Math.min(a.length, b.length) - start && isDeepStrictEqual(a[a.length - end - 1], b[b.length - end - 1])) end++
      // Sliding notes discard their oldest entry. Prefix/suffix diff alone would
      // resend the entire 30-entry window; preserve the overlapping sequence.
      if (start === 0 && end === 0 && b.length) {
        for (let removed = 1; removed < a.length; removed++) {
          const overlap = Math.min(a.length - removed, b.length)
          if (!Array.from({ length: overlap }, (_, i) => i).every(i => isDeepStrictEqual(a[removed + i], b[i]))) continue
          operations.push({ op: 'splice', path, index: 0, deleteCount: removed, items: [] })
          if (b.length > overlap || a.length - removed > overlap) operations.push({ op: 'splice', path, index: overlap, deleteCount: a.length - removed - overlap, items: b.slice(overlap) })
          return
        }
      }
      operations.push({ op: 'splice', path, index: start, deleteCount: a.length - start - end, items: b.slice(start, b.length - end) })
    } else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const key of Object.keys(a)) if (!Object.hasOwn(b, key)) operations.push({ op: 'remove', path: [...path, key] })
      for (const key of Object.keys(b)) {
        if (!Object.hasOwn(a, key)) operations.push({ op: 'set', path: [...path, key], value: b[key] })
        else visit(a[key], b[key], [...path, key])
      }
    } else operations.push({ op: 'set', path, value: b })
  }
  visit(wireState(before), wireState(after), [])
  return { format: 'trpg-state-delta-v1', baseRevision: before.revision, revision: after.revision, operations }
}

/** Reference decoder for recovery/contract tests; a missing base must never be guessed. */
export function applyStateDelta(before, delta) {
  if (delta.format !== 'trpg-state-delta-v1' || before.revision !== delta.baseRevision) throw new Error('状态增量基线不匹配，请完整load后继续')
  let state = wireState(before)
  for (const change of delta.operations) {
    if (change.path.length === 0) {
      if (change.op !== 'set') throw new Error('无效根操作')
      state = structuredClone(change.value)
      continue
    }
    let parent = state
    for (const part of change.path.slice(0, -1)) {
      if (!parent || !Object.hasOwn(parent, part)) throw new Error('状态增量路径不存在')
      parent = parent[part]
    }
    const key = change.path.at(-1)
    if (change.op === 'set') Object.defineProperty(parent, key, { value: structuredClone(change.value), enumerable: true, writable: true, configurable: true })
    else if (change.op === 'remove') delete parent[key]
    else if (change.op === 'splice' && Array.isArray(parent[key])) parent[key].splice(change.index, change.deleteCount, ...structuredClone(change.items))
    else throw new Error('无效状态增量操作')
  }
  if (state.revision !== delta.revision) throw new Error('状态增量版本不匹配')
  return state
}
