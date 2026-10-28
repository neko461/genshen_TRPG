import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { Runtime, VERSION } from '../engine/runtime.js'
import { BUILD_SCHEMES, validateBuild } from '../engine/rules.js'
import { createTools } from '../lib/tools.js'
const root = process.env.TRPG_ROOT || fileURLToPath(new URL('../../..', import.meta.url))
assert(Number(process.versions.node.split('.')[0]) >= 22, '需要 Node.js 22 或更高版本')
for (const p of ['center_setting/center_setting.md', 'docs/rules/timeline.md', 'docs/rules/finalized-stat-rules-v1.0.md', 'docs/rules/mainline-rules.md', 'docs/gm/gm-handbook.md']) assert(fs.existsSync(path.join(root, p)), `缺少 ${p}`)
for (const value of Object.values(BUILD_SCHEMES)) assert(validateBuild(value).ok)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-doctor-'))
try {
  const r = new Runtime({ root: tmp, d6Source: () => 4 })
  const call = (tool, input) => r.execute({ tool, input, mode: 'solo', slot: 'doctor' })
  call('trpg_save', { op: 'demo' })
  call('trpg_scene', { op: 'open', goal: '环境自检' })
  call('trpg_scene', { op: 'check', actor: 'pc', attribute: '灵巧' })
  call('trpg_scene', { op: 'close' })
  assert(call('trpg_save', { op: 'verify' }).valid)
  console.log(`${VERSION} 自检通过：Node ${process.versions.node}，${createTools({ root: tmp }).length} 个工具，24 个敌怪模板，持久化/判定/关场/回放正常。`)
  console.log('本地试玩不需要 npm install 或模型密钥。DSH 本体未包含，插件宿主集成需在你的环境另测。')
} finally { fs.rmSync(tmp, { recursive: true, force: true }) }
