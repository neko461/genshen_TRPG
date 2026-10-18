import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { VERSION } from '../engine/runtime.js'

test('插件、运行时与新发布目标统一标记为 v0.02', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const release = fs.readFileSync(new URL('../scripts/release.mjs', import.meta.url), 'utf8')
  assert.equal(VERSION, 'genshen_TRPG_v0.02')
  assert.equal(pkg.version, '0.0.2')
  assert.match(pkg.description, /genshen_TRPG_v0\.02/)
  assert.match(release, /releases', 'genshen_TRPG_v0\.02'/)
  assert.match(release, /version: 'genshen_TRPG_v0\.02'/)
  assert.doesNotMatch(release, /genshen_TRPG_v0\.01/)
})
