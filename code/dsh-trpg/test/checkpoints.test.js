import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Runtime } from '../engine/runtime.js'
import { branchCheckpoint, createCheckpoint, listCheckpoints } from '../engine/checkpoints.js'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.test-checkpoints-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runtime = new Runtime({ root, d6Source: () => 4, random: () => 0 })
  const call = (tool, input = {}, slot = 'source') => runtime.execute({ mode: 'solo', slot, tool, input })
  call('trpg_save', { op: 'demo' })
  return { root, runtime, call }
}

test('主动保存后可从历史点分支，原档与后续记录都保留', t => {
  const f = fixture(t)
  f.call('trpg_state', { op: 'set', location: '蒙德城·西风骑士团', reason: '测试保存点' })
  const savedState = f.call('trpg_save', { op: 'load' }).state
  const saved = f.call('trpg_save', { op: 'checkpoint', name: '测试起点', description: '准备离开协会，开始风龙线调查。' }).checkpoint
  assert.equal(saved.description, '准备离开协会，开始风龙线调查。')
  assert.equal(saved.progress.location, savedState.world.location)
  assert.equal(saved.progress.day, savedState.world.day)
  f.call('trpg_state', { op: 'set', location: '清泉镇', reason: '保存后继续推进' })

  const checkpoints = f.call('trpg_save', { op: 'checkpoints' }).checkpoints
  assert.equal(checkpoints.length, 1)
  assert.equal(checkpoints[0].id, saved.id)
  assert.equal(checkpoints[0].description, '准备离开协会，开始风龙线调查。')
  assert.equal(checkpoints[0].progress.location, savedState.world.location)
  assert.equal(checkpoints[0].progress.day, savedState.world.day)
  assert.throws(() => f.call('trpg_save', { op: 'branch', checkpointId: saved.id, targetSlot: 'replay' }), /明确确认/)
  const branched = f.call('trpg_save', { op: 'branch', checkpointId: saved.id, targetSlot: 'replay', playerConfirmed: true })
  const replayed = f.call('trpg_save', { op: 'load' }, 'replay').state

  assert.equal(branched.integrity.valid, true)
  assert.equal(replayed.world.location, savedState.world.location)
  assert.equal(replayed.slot, 'replay')
  assert.equal(replayed.revision, saved.revision + 1)
  assert.equal(f.call('trpg_save', { op: 'load' }, 'source').state.world.location, '清泉镇')
  assert.equal(f.call('trpg_save', { op: 'verify' }, 'source').valid, true)
  assert.throws(() => f.call('trpg_save', { op: 'branch', checkpointId: saved.id, targetSlot: 'replay', playerConfirmed: true }), /已存在/)
})

test('损坏的回溯点不会出现在列表中或被读取', t => {
  const f = fixture(t)
  const saved = f.call('trpg_save', { op: 'checkpoint', name: '可损坏测试' }).checkpoint
  const file = path.join(f.root, 'save', 'checkpoints', 'solo', 'source', `${saved.id}.json`)
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  data.state.world.location = '伪造地点'
  fs.writeFileSync(file, JSON.stringify(data))
  assert.throws(() => f.call('trpg_save', { op: 'checkpoints' }), /校验失败/)
  assert.throws(() => f.call('trpg_save', { op: 'branch', checkpointId: saved.id, targetSlot: 'tampered', playerConfirmed: true }), /校验失败/)
})

test('回溯点保存并恢复DSH会话消息位置，旧格式仍可只恢复游戏', t => {
  const f = fixture(t)
  const withChat = createCheckpoint(f.root, 'solo', 'source', '聊天关联点', '保存后可回到这轮对话。', { sessionId: 'dsh-session-test', atSeq: 42 })
  assert.deepEqual(withChat.conversation, { sessionId: 'dsh-session-test', atSeq: 42 })
  assert.deepEqual(listCheckpoints(f.root, 'solo', 'source')[0].conversation, { sessionId: 'dsh-session-test', atSeq: 42 })
  const branch = branchCheckpoint(f.root, 'solo', 'source', withChat.id, 'chat_replay')
  assert.deepEqual(branch.conversation, { sessionId: 'dsh-session-test', atSeq: 42 })

  const withoutChat = createCheckpoint(f.root, 'solo', 'source', '旧格式兼容点')
  assert.equal(withoutChat.conversation, null)
  assert.equal(branchCheckpoint(f.root, 'solo', 'source', withoutChat.id, 'game_only').conversation, null)
  const invalid = createCheckpoint(f.root, 'solo', 'source', '非法会话标记', '', { sessionId: '', atSeq: -1 })
  assert.equal(invalid.conversation, null)
})
