import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function safeId(value, label = '标识') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_\-]{1,48}$/.test(value) || /^(con|prn|aux|nul|com\d|lpt\d|__proto__|constructor|prototype)$/i.test(value)) {
    throw new Error(`${label}须为 1–48 位字母、数字、下划线或短横线`)
  }
  return value
}

/** 日志是事实源：每笔提交含完整 after 状态；快照仅为可丢弃的投影。 */
export class Journal {
  constructor(root, mode, slot) {
    if (!['solo', 'multi'].includes(mode)) throw new Error('须明确指定 mode: solo 或 multi')
    safeId(slot, '槽位')
    this.mode = mode
    this.slot = slot
    this.dir = path.resolve(root, 'save', 'slots', mode, slot)
    const base = path.resolve(root, 'save', 'slots', mode)
    if (path.dirname(this.dir) !== base) throw new Error('存档路径越界')
    let component = path.resolve(root)
    for (const part of ['save', 'slots', mode, slot]) {
      component = path.join(component, part)
      if (fs.existsSync(component) && fs.lstatSync(component).isSymbolicLink()) throw new Error('存档目录不能使用符号链接或目录联接')
    }
    this.file = path.join(this.dir, 'journal.jsonl')
  }
  records() {
    if (!fs.existsSync(this.file)) return []
    const raw = fs.readFileSync(this.file, 'utf8')
    if (raw && !raw.endsWith('\n')) throw new Error('日志尾部写入不完整；已停止读写，请保留目录并报告，禁止跳过坏行')
    let previous = 'genesis'
    return raw.split('\n').filter(Boolean).map((line, i) => {
      let event
      try { event = JSON.parse(line) } catch { throw new Error(`事件 ${i + 1} JSON 损坏，已停止`) }
      const { checksum, ...body } = event
      if (body.seq !== i + 1 || body.previous !== previous || hash(body) !== checksum) throw new Error(`事件 ${i + 1} 校验失败，已停止`)
      previous = checksum
      return event
    })
  }
  load() {
    const all = this.records()
    if (!all.length) throw new Error('槽位尚未创建，请先新建战役')
    return structuredClone(all.at(-1).after)
  }
  commit(command, input, mutate, { create = false, requestId, expectedRevision } = {}) {
    fs.mkdirSync(this.dir, { recursive: true })
    const lock = path.join(this.dir, '.transaction.lock')
    let fd
    try { fd = fs.openSync(lock, 'wx') } catch { throw new Error('槽位正在写入或遗留事务锁；请稍后重试，勿并行操作同一槽位') }
    try {
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }))
      const events = this.records()
      const fingerprint = hash({ command, input })
      if (requestId) {
        safeId(requestId, '请求编号')
        const existing = events.find((e) => e.requestId === requestId)
        if (existing) {
          if (existing.fingerprint !== fingerprint) throw new Error('请求编号已被不同操作使用')
          const result = structuredClone(existing.result)
          const latest = events.at(-1).after
          if (result.state) result.state = Object.fromEntries(Object.keys(result.state).map((key) => [key, structuredClone(latest[key])]))
          return { ...result, revision: events.length, originalRevision: existing.seq, eventId: existing.id, replayed: true }
        }
      }
      if (create && (events.length || fs.existsSync(path.join(this.dir, 'campaign.json')))) throw new Error('该槽位已存在；请换槽位，不会覆盖旧档')
      if (!create && !events.length) throw new Error('槽位尚未创建')
      if (expectedRevision !== undefined && expectedRevision !== events.length) throw new Error('状态已更新，请刷新后重试')
      const state = events.length ? structuredClone(events.at(-1).after) : null
      const { state: after, result } = mutate(state)
      const seq = events.length + 1
      after.revision = seq
      if (result.state) result.state.revision = seq
      const body = { seq, id: `EV${String(seq).padStart(6, '0')}`, at: new Date().toISOString(), command, input, fingerprint, requestId: requestId ?? null, previous: events.at(-1)?.checksum ?? 'genesis', result, after }
      const event = { ...body, checksum: hash(body) }
      const journalFd = fs.openSync(this.file, 'a')
      try { fs.writeFileSync(journalFd, JSON.stringify(event) + '\n'); fs.fsyncSync(journalFd) } finally { fs.closeSync(journalFd) }
      // 提交在日志 fsync 后即成立；投影失败不把已提交动作报告为失败。
      let warning
      const tmp = path.join(this.dir, `state.${process.pid}.tmp`)
      try { fs.writeFileSync(tmp, JSON.stringify(after, null, 2) + '\n'); fs.renameSync(tmp, path.join(this.dir, 'state.json')) }
      catch { warning = '动作已记入日志，快照未更新；重新载入将从日志恢复' }
      return { ...structuredClone(result), revision: seq, eventId: body.id, ...(warning ? { warning } : {}) }
    } finally { fs.closeSync(fd); fs.unlinkSync(lock) }
  }
  verify() {
    const all = this.records()
    return { valid: true, events: all.length, revision: all.length, stateHash: all.length ? hash(all.at(-1).after) : null }
  }
}
