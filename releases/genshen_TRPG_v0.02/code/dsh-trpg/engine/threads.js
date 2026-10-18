/**
 * 世界线索（thread）的收束模型。
 *
 * 目标不是把任务清单化，而是让换站这件不可逆的事**只在明确处置后发生**：
 * - 主线关键线程（kind=主线）未收束时阻止换站，且不允许放弃或延期；
 * - 普通支线（kind=支线）由玩家选择完成、放弃或延期，三者都会留下记录；
 * - 旧档的线程没有 kind 字段时**只读推断、不回写存档**，
 *   并在报告中标注来源，交由 GM 显式 classifyThread 确认。
 *
 * 约束：本模块只做状态与校验，不生成叙事。
 */

export const THREAD_KINDS = Object.freeze(['主线', '支线'])
export const THREAD_OUTCOMES = Object.freeze(['resolved', 'abandoned', 'deferred'])

/** 旧档线程的推断分类。只用于报告，不写回存档。 */
export function inferThreadKind(thread) {
  // 有硬时限的线索一定与时间后果绑定，按主线对待（保守）。
  return Number.isInteger(thread.deadlineDay) ? '主线' : '支线'
}

export function threadKindOf(thread) {
  if (thread.kind !== undefined) return { kind: thread.kind, source: 'explicit' }
  return { kind: inferThreadKind(thread), source: 'inferred' }
}

/** 仍在进行中的线索：open，或被延期到后续站点的 deferred。 */
export function isPending(thread) { return thread.status === 'open' || thread.status === 'deferred' }

/** 延期后仍未收束的线索会跟着玩家走，不能当作已经处理。 */
export function pendingThreads(state) {
  return (state.world.threads ?? []).filter(isPending)
}

/** 该线索可用的处置方式：主线只能实际完成，支线可完成、放弃、延期。 */
export function threadActions(thread) {
  const { kind } = threadKindOf(thread)
  return kind === '主线' ? ['resolve'] : ['resolve', 'abandon', 'defer']
}

/** 换站时本条线索仍未收束的后果说明。 */
export function unresolvedConsequence(thread, day) {
  const { kind } = threadKindOf(thread)
  const overdue = Number.isInteger(thread.deadlineDay) && day > thread.deadlineDay
  const base = kind === '主线' ? '主线关键线索未收束：换站后本题不再推进。' : '支线未收束：换站后本题仍未完成。'
  return base + (overdue ? `已过第${thread.deadlineDay}日时限，后果：${thread.deadlineConsequence}` : '')
}

/**
 * 换站前必须处理的线索与原因。
 *
 * 主线：未收束即阻止换站，且不允许放弃/延期。
 * 支线：也须显式处置（完成/放弃/延期），但处置权在玩家。
 * 返回 blocking 供 nextStation 强制，其余供展示。
 */
export function threadGate(state) {
  const threads = pendingThreads(state).map((thread) => {
    const { kind, source } = threadKindOf(thread)
    const overdue = Number.isInteger(thread.deadlineDay) && state.world.day > thread.deadlineDay
    return {
      id: thread.id, text: thread.text, status: thread.status, kind, kindSource: source,
      deadlineDay: thread.deadlineDay ?? null,
      deadlineConsequence: thread.deadlineConsequence ?? null,
      originStation: thread.originStation ?? null,
      deferredTo: thread.deferredTo ?? null,
      overdue,
      actions: threadActions(thread),
      unresolvedConsequence: unresolvedConsequence(thread, state.world.day),
    }
  })
  // 主线：未收束一律阻止换站（延期对它不成立，故 deferred 也只可能因其被错标）。
  const blocking = threads.filter(t => t.kind === '主线')
  // 支线仍 open：须玩家先决定完成/放弃/延期。
  const undecided = threads.filter(t => t.kind === '支线' && t.status === 'open')
  // 已延期的支线：玩家已经做过决定，不阻止换站，但继续随行并在清单里挂着。
  const deferred = threads.filter(t => t.status === 'deferred')
  return {
    threads, blocking, undecided, deferred,
    needsClassification: threads.filter(t => t.kindSource === 'inferred').map(t => t.id),
  }
}

/** 展示给 GM/玩家、再由 GM 转述给玩家的到期清单。 */
export function describeThreadGate(gate) {
  if (!gate.threads.length) return null
  const lines = gate.threads.map(t => {
    const label = t.kind === '主线' ? '主线（必须实际完成）' : '支线（可完成/放弃/延期）'
    const inferred = t.kindSource === 'inferred' ? '；分类为旧档推断，请用 classifyThread 确认' : ''
    const deferred = t.status === 'deferred' ? `；已延期至第${t.deferredTo}站，仍未收束，会随行保留` : ''
    const overdue = t.overdue ? `｜已过期：${t.deadlineConsequence}` : ''
    return `- ${t.id}：【${label}】${t.text}${overdue}${deferred}${inferred}`
  })
  const heads = []
  if (gate.blocking.length) heads.push(`换站前仍有关键主线未收束，不能换站：${gate.blocking.map(t => t.id).join('、')}。`)
  if (gate.undecided.length) heads.push(`换站前还有支线未处置，须由玩家选择完成、放弃或延期：${gate.undecided.map(t => t.id).join('、')}。`)
  if (!heads.length) heads.push('没有必须先处置的线索，可以换站。')
  const deferredNote = gate.deferred.length ? `\n另有${gate.deferred.length}条已延期的支线会随行保留，请向玩家说明它们仍未完成。` : ''
  return `${heads.join('\n')}\n${lines.join('\n')}${deferredNote}\n先把这份清单和每条的后果展示给玩家，等他决定再调用工具；主线只能实际完成，不能以放弃或延期绕过。`
}
