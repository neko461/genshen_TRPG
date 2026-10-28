import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const dir = fileURLToPath(new URL('../test/', import.meta.url))
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).map((f) => new URL(`../test/${f}`, import.meta.url)).map(fileURLToPath)
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })
if (result.error) { console.error(result.error.message); process.exitCode = 1 } else process.exitCode = result.status ?? 1
