import { Runtime, normalizeToolInput } from '../engine/runtime.js'
import { Journal, safeId } from '../engine/journal.js'
import { playerAction } from '../engine/battle.js'

const pending = new Set()
export function parsePlayerDice(text) {
  if (typeof text !== 'string') throw new Error('请提交两个骰面，例如 4,3，不能只填合计')
  const match = /^\s*([1-6])\s*[,，、+\s]\s*([1-6])\s*$/.exec(text)
  if (!match) throw new Error('请提交两个1–6的骰面，例如 4,3，不能只填合计')
  return [Number(match[1]), Number(match[2])]
}

export async function playerCheck(runtime, args, exec, askPlayer, options, tool = 'trpg_check') {
  args = { ...args, input: normalizeToolInput(args.input) }
  if (!askPlayer) throw new Error('当前宿主没有玩家回答入口；本次未掷骰或执行检定')
  safeId(args.requestId, '玩家检定请求编号')
  const { waitForPlayer, ...input } = args.input
  if (input.dice !== undefined) throw new Error('骰面必须由玩家提交，不能由GM在工具参数中代填')
  const combat = tool !== 'trpg_check'
  const request = { ...args, tool, input }
  const journal = new Journal(runtime.root, args.mode, args.slot)
  if (journal.records().some(event => event.requestId === args.requestId)) return runtime.execute(request)
  const key = `${runtime.root}|${args.mode}|${args.slot}`
  if (pending.has(key)) throw new Error('该战役已有等待玩家回答的检定，请先处理它')
  pending.add(key)
  try {
    const state = journal.load()
    if (args.expectedRevision !== undefined && args.expectedRevision !== state.revision) throw new Error('状态已更新，请先重新读取并说明检定条件')
    // Validate on a clone with fixed probe faces; no real RNG, journal writes, or resource changes.
    const probe = new Runtime({ root: runtime.root, d6Source: () => 3 })
    if (combat && state.characters[input.actor]?.type !== 'player') throw new Error('玩家提交入口仅用于玩家角色，队友按主持约定行动')
    const preview = (combat
      ? playerAction(structuredClone(state), { ...input, action: input.action ?? 'attack' }, probe.rng)
      : probe.scene(structuredClone(state), { ...input, op: 'check' })).check
    if (!preview) throw new Error('该动作不需要掷骰，请直接使用战斗动作工具')
    const b = preview.breakdown
    const signed = value => value >= 0 ? `+${value}` : String(value)
    const details = [
      input.purpose ?? (combat ? `战斗行动：${input.action ?? 'attack'} → ${input.target ?? '脱离战斗'}` : state.scene.goal),
      `角色：${state.characters[input.actor].name}；${input.attribute ?? '灵巧'} ${signed(b.attribute)}`,
      input.tag ? `标签：${input.tag} ${signed(b.tag)}` : '不使用标签',
      `难度：${input.difficulty ?? '普通'} ${signed(b.difficulty)}；协助/处境 ${signed(b.circumstance)}；有效总修正 ${signed(Math.min(5, b.sum))}`,
      input.risk ? `可预见风险：${input.risk}` : '风险按GM刚才的公开说明；不在提交后临时追加条件。',
      ...(input.retreatCost ? [`仅代价成功时额外支付：${input.retreatCost.reason}${input.retreatCost.quantity ? `（${input.retreatCost.quantity}份）` : ''}。完整成功不支付此项；撤退本身的任务取舍另算。`] : []),
      ...(combat ? ['提交后按真实战斗规则结算命中、伤害、资源与回合；取消不消耗行动。'] : []),
      '选择“掷骰”由引擎生成两个d6；也可在自定义回答中提交实体骰的两个骰面，例如 4,3。',
    ].join('\n\n')
    const response = await askPlayer({
      questions: [{ id: args.requestId, header: '玩家检定', question: details, options: [
        { label: '掷骰', description: '确认当前条件并掷出两个六面骰。' },
        { label: '暂不检定', description: '保留当前场景，回到对话调整行动。' },
      ] }],
      ...(exec?.agent ? { agent: exec.agent } : {}), signal: exec?.signal,
    })
    if (exec?.signal?.aborted) throw new Error('检定已取消，未提交结果')
    const answer = response.answers?.find(a => a.id === args.requestId)
    const custom = answer?.custom?.trim()
    if (!custom && !answer?.selected?.includes('掷骰')) return { cancelled: true, note: '玩家未掷骰，未消耗检定次数、战斗行动或资源。' }
    const faces = custom ? parsePlayerDice(custom) : null
    const dice = faces ? [...faces] : null
    const resolved = new Runtime({ ...options, root: runtime.root, ...(dice ? { d6Source: () => dice.shift() } : {}) })
    // Freeze conditions at the version shown to the player; a concurrent change cannot silently alter the roll.
    return resolved.execute({ ...request, expectedRevision: state.revision })
  } finally { pending.delete(key) }
}
