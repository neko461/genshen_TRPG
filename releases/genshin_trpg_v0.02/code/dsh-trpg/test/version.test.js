import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { VERSION } from '../engine/runtime.js'
import { name as pluginName } from '../lib/index.js'

test('插件、运行时与新发布目标统一标记为 v0.02', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const release = fs.readFileSync(new URL('../scripts/release.mjs', import.meta.url), 'utf8')
  assert.equal(VERSION, 'genshin_trpg_v0.02')
  assert.equal(pkg.version, '0.0.2')
  assert.equal(pkg.name, 'genshin_trpg')
  assert.equal(pluginName, pkg.name)
  assert.equal(pkg.repository.url, 'git+https://github.com/neko461/genshin_trpg.git')
  const patch = fs.readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const client = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(patch, /id: genshin_trpg/)
  assert.match(patch, /name: genshin_trpg/)
  assert.match(client, /id: 'genshin_trpg'/)
  assert.match(client, /localStorage.getItem\(`dsh-trpg-slot-\$\{sessionId\}`\)/, '仍能读取旧插件已记住的槽位')
  assert.match(pkg.description, /genshin_trpg_v0\.02/)
  assert.match(release, /releases', 'genshin_trpg_v0\.02'/)
  assert.match(release, /version: 'genshin_trpg_v0\.02'/)
  assert.doesNotMatch(release, /genshin_trpg_v0\.01/)
})
