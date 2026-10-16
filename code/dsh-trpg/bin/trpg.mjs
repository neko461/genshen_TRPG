import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Runtime } from '../engine/runtime.js'
try {
  const i = process.argv.indexOf('--request')
  const raw = i >= 0 ? fs.readFileSync(process.argv[i + 1], 'utf8') : fs.readFileSync(0, 'utf8')
  if (Buffer.byteLength(raw) > 65536) throw new Error('请求过大')
  const request = JSON.parse(raw.replace(/^\uFEFF/, ''))
  const runtime = new Runtime({ root: process.env.TRPG_ROOT || fileURLToPath(new URL('../../..', import.meta.url)) })
  console.log(JSON.stringify({ ok: true, result: runtime.execute(request) }, null, 2))
} catch (e) { console.error(JSON.stringify({ ok: false, error: e.message })); process.exitCode = 1 }
