import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Journal, fingerprintOf, hash, safeId } from './journal.js'
import { publicState } from './campaign.js'

function assertSafePath(root, parts) {
  let current = path.resolve(root)
  for (const part of parts) {
    current = path.join(current, part)
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('存档目录不能使用符号链接或目录联接')
  }
  return current
}

function checkpointDirectory(root, mode, slot, create = false) {
  if (!['solo', 'multi'].includes(mode)) throw new Error('须明确指定 mode: solo 或 multi')
  safeId(slot, '槽位')
  const dir = assertSafePath(root, ['save', 'checkpoints', mode, slot])
  const base = path.resolve(root, 'save', 'checkpoints', mode)
  if (path.dirname(dir) !== base) throw new Error('回溯点路径越界')
  if (create) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function verifyCheckpoint(root, file, expectedMode, expectedSlot) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const { checksum, ...body } = data
  if (!checksum || hash(body) !== checksum) throw new Error('回溯点校验失败，文件可能已损坏')
  if (data.mode !== expectedMode || data.slot !== expectedSlot) throw new Error('回溯点与当前槽位不匹配')
  if (!Array.isArray(data.events) || data.events.length !== data.revision || !data.events.length) throw new Error('回溯点事件记录不完整')
  const journal = new Journal(root, data.mode, data.slot)
  journal.verifyRecords(data.events)
  if (hash(data.events.at(-1).after) !== hash(data.state) || data.state.revision !== data.revision || hash(data.state) !== data.stateHash) throw new Error('回溯点状态与日志不一致')
  return data
}

function progressOf(state) {
  const battle = state.battle && !state.battle.over
    ? `战斗进行中·第${state.battle.round}轮`
    : state.battle?.over ? `最近战斗${state.battle.outcome === 'victory' ? '胜利' : state.battle.outcome === 'retreated' ? '撤退' : '结束'}` : ''
  return {
    campaign: state.title,
    station: state.timeline?.name ?? '',
    location: state.world?.location ?? '',
    day: state.world?.day ?? null,
    scene: state.scene && !state.scene.closed ? state.scene.goal : '',
    battle,
  }
}

function normalizeConversation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const sessionId = typeof value.sessionId === 'string' ? value.sessionId.trim() : ''
  const atSeq = value.atSeq
  if (!sessionId || sessionId.length > 200 || !Number.isSafeInteger(atSeq) || atSeq < 0) return null
  return { sessionId, atSeq }
}

export function createCheckpoint(root, mode, slot, name, description = '', conversation = null) {
  const journal = new Journal(root, mode, slot)
  const events = journal.records()
  if (!events.length) throw new Error('槽位尚未创建，不能保存回溯点')
  const state = structuredClone(events.at(-1).after)
  const id = `cp_${Date.now().toString(36)}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
  const body = {
    id, mode, slot, name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : `第 ${events.length} 笔事件`,
    description: typeof description === 'string' ? description.trim().slice(0, 240) : '',
    conversation: normalizeConversation(conversation),
    progress: progressOf(state),
    savedAt: new Date().toISOString(), revision: events.length, stateHash: hash(state), state, events,
  }
  const data = { ...body, checksum: hash(body) }
  const dir = checkpointDirectory(root, mode, slot, true)
  const tmp = path.join(dir, `.${id}.tmp`)
  const file = path.join(dir, `${id}.json`)
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
  fs.renameSync(tmp, file)
  return { id, name: data.name, description: data.description, progress: data.progress, conversation: data.conversation, savedAt: data.savedAt, mode, slot, revision: data.revision, stateHash: data.stateHash }
}

export function listCheckpoints(root, mode, slot) {
  const dir = checkpointDirectory(root, mode, slot)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => verifyCheckpoint(root, path.join(dir, entry.name), mode, slot))
    .sort((a, b) => a.savedAt.localeCompare(b.savedAt))
    .map(({ id, name, description, progress, conversation, savedAt, revision, stateHash }) => ({ id, name, description, progress, conversation, savedAt, revision, stateHash }))
}

export function branchCheckpoint(root, mode, slot, checkpointId, targetSlot) {
  safeId(checkpointId, '回溯点编号')
  safeId(targetSlot, '新槽位')
  const sourceDir = checkpointDirectory(root, mode, slot)
  const sourceFile = path.join(sourceDir, `${checkpointId}.json`)
  if (!fs.existsSync(sourceFile) || fs.lstatSync(sourceFile).isSymbolicLink()) throw new Error('找不到该回溯点')
  const checkpoint = verifyCheckpoint(root, sourceFile, mode, slot)
  const target = new Journal(root, mode, targetSlot)
  if (fs.existsSync(target.dir)) throw new Error('目标槽位已存在；请换一个新槽位，原存档不会覆盖')
  const base = path.dirname(target.dir)
  assertSafePath(root, ['save', 'slots', mode])
  fs.mkdirSync(base, { recursive: true })
  fs.mkdirSync(target.dir)

  const seq = checkpoint.revision + 1
  const after = structuredClone(checkpoint.state)
  after.revision = seq
  after.slot = targetSlot
  const input = { checkpointId, fromSlot: slot, fromRevision: checkpoint.revision }
  const body = {
    seq, id: `EV${String(seq).padStart(6, '0')}`, at: new Date().toISOString(), command: 'checkpoint-branch',
    input, fingerprint: fingerprintOf('checkpoint-branch', input), requestId: null,
    previous: checkpoint.events.at(-1).checksum, result: { branchedFrom: input }, after,
  }
  const records = [...checkpoint.events, { ...body, checksum: hash(body) }]
  fs.writeFileSync(target.file, records.map(event => JSON.stringify(event)).join('\n') + '\n', { flag: 'wx' })
  fs.writeFileSync(path.join(target.dir, 'state.json'), JSON.stringify(after, null, 2) + '\n', { flag: 'wx' })
  return { source: { slot, revision: checkpoint.revision, checkpointId }, state: publicState(after), conversation: checkpoint.conversation ?? null, integrity: target.verify() }
}
