import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
/**
 * 键序无关的规范形：只用于**请求指纹**，不改变事件存盘内容。
 * 同一组参数换个键顺序（{damage:12,reason} 与 {reason,hp:-12}）必须命中同一指纹，
 * 否则“换个等价写法重试”会被误判为不同操作而二次扣血。
 */
export function canonicalInput(value) {
  if (Array.isArray(value)) return value.map(canonicalInput)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalInput(value[key])]))
  }
  return value
}
export function fingerprintOf(command, input) {
  return hash({ command, input: canonicalInput(input) })
}
export function safeId(value, label = '标识') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_\-]{1,48}$/.test(value) || /^(con|prn|aux|nul|com\d|lpt\d|__proto__|constructor|prototype)$/i.test(value)) {
    throw new Error(`${label}须为 1–48 位字母、数字、下划线或短横线`)
  }
  return value
}

/** 日志是事实源：每笔提交含完整 after 状态；快照仅为可丢弃的投影。 */
export class Journal {
  /** 最近一次校验过的日志前缀；只作加速，任何不符都退回整份重验。 */
  #cache = null
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
  /**
   * 校验一批日志行并接到既有校验链上。
   * `start` 为该批第一行的字节偏移，`seqBase` 为其之前已校验的事件数。
   */
  #parse(raw, seqBase, previous, start) {
    const events = []
    let index = start
    for (const line of raw.split('\n')) {
      if (!line) continue
      let event
      try { event = JSON.parse(line) } catch { throw new Error(`事件 ${seqBase + events.length + 1} JSON 损坏，已停止`) }
      const { checksum, ...body } = event
      if (body.seq !== seqBase + events.length + 1 || body.previous !== previous || hash(body) !== checksum) {
        throw new Error(`事件 ${seqBase + events.length + 1} 校验失败，已停止`)
      }
      previous = checksum
      index += Buffer.byteLength(line, 'utf8') + 1
      events.push(event)
    }
    return { events, offset: index, previous }
  }
  /**
   * 日志是事实源。事实源只追加，因此**已校验的前缀不重复解析**：
   * - 文件未变：直接返回上次校验结果；
   * - 文件变长：先比对已校验前缀的原始字节，确认未被改写，再只校验新增尾部；
   * - 前缀被改写、文件被截断或长度不符：丢弃缓存整份重验。
   * 任何情况下都不跳过坏行。缓存只影响速度，不影响判定结果。
   */
  records() {
    if (!fs.existsSync(this.file)) { this.#cache = null; return [] }
    const stat = fs.statSync(this.file)
    const cache = this.#cache
    if (cache && cache.size === stat.size && cache.mtimeMs === stat.mtimeMs) return cache.events
    let next = null
    if (cache && stat.size > cache.offset) {
      const fd = fs.openSync(this.file, 'r')
      let head, tail
      try {
        head = Buffer.allocUnsafe(cache.offset)
        fs.readSync(fd, head, 0, cache.offset, 0)
        const length = stat.size - cache.offset
        tail = Buffer.allocUnsafe(length)
        fs.readSync(fd, tail, 0, length, cache.offset)
      } finally { fs.closeSync(fd) }
      // 前缀必须逐字节一致；不一致说明日志被外部改写，不能沿用旧解析结果。
      if (!head.equals(cache.raw)) throw new Error('日志已校验前缀被改写；已停止读写，请保留目录并报告，禁止在缓存上继续读写')
      const text = tail.toString('utf8')
      if (!text.endsWith('\n')) throw new Error('日志尾部写入不完整；已停止读写，请保留目录并报告，禁止跳过坏行')
      const parsed = this.#parse(text, cache.events.length, cache.previous, cache.offset)
      next = { offset: parsed.offset, previous: parsed.previous, events: cache.events.concat(parsed.events), raw: Buffer.concat([cache.raw, tail]) }
    }
    if (!next) {
      const raw = fs.readFileSync(this.file)
      const text = raw.toString('utf8')
      if (text && !text.endsWith('\n')) throw new Error('日志尾部写入不完整；已停止读写，请保留目录并报告，禁止跳过坏行')
      const parsed = this.#parse(text, 0, 'genesis', 0)
      next = { offset: parsed.offset, previous: parsed.previous, events: parsed.events, raw }
    }
    this.#cache = { size: stat.size, mtimeMs: stat.mtimeMs, ...next }
    return next.events
  }
  /**
   * 测试专用：把一份完整 after 状态按正式校验链追加为事件。
   * 不用于生产路径；调用方须自行保证 after 与日志尾部状态衔接。
   */
  appendRawForTest(after) {
    const events = this.records()
    const seq = events.length + 1
    const body = {
      seq, id: `EV${String(seq).padStart(6, '0')}`, at: new Date().toISOString(),
      command: 'test-fixture', input: {}, fingerprint: fingerprintOf('test-fixture', {}),
      requestId: null, previous: events.at(-1)?.checksum ?? 'genesis', result: {}, after,
    }
    fs.mkdirSync(this.dir, { recursive: true })
    fs.appendFileSync(this.file, JSON.stringify({ ...body, checksum: hash(body) }) + '\n')
    return seq
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
      const fingerprint = fingerprintOf(command, input)
      const legacyFingerprint = hash({ command, input })
      if (requestId) {
        safeId(requestId, '请求编号')
        const existing = events.find((e) => e.requestId === requestId)
        if (existing) {
          // 旧事件用未排序键的指纹写入；两种都接受，历史事件才能继续命中幂等回放。
          if (existing.fingerprint !== fingerprint && existing.fingerprint !== legacyFingerprint) throw new Error('请求编号已被不同操作使用')
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
  verify() { return this.verifyRecords(this.records()) }
  /** 调用方已持有 `records()` 结果时复用，避免重复读取与校验整份日志。 */
  verifyRecords(all) {
    return { valid: true, events: all.length, revision: all.length, stateHash: all.length ? hash(all.at(-1).after) : null }
  }
}
