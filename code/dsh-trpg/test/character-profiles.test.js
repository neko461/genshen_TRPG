import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Runtime } from '../engine/runtime.js'
import { characterProfiles } from '../engine/character-profiles.js'

test('八地区JSON逐字保留全部人物/上下文，发布副本与源一致，索引不含正文', () => {
  const base = new URL('../data/characters/', import.meta.url)
  const index = JSON.parse(fs.readFileSync(new URL('index.json', base)))
  assert.equal(index.length, 192)
  assert.equal(new Set(index.map(entry => entry.id)).size, index.length)
  assert.ok(index.every(entry => !Object.hasOwn(entry, 'text')))
  for (const file of new Set(index.map(entry => entry.file))) {
    const source = JSON.parse(fs.readFileSync(new URL(`../../../character_setting/characters/${file}`, import.meta.url)))
    assert.deepEqual(JSON.parse(fs.readFileSync(new URL(file, base))), source)
    assert.equal(source.entries.map(entry => entry.text).join(''), fs.readFileSync(new URL(`../../../character_setting/characters/${file.replace('.json', '.md')}`, import.meta.url), 'utf8'))
    assert.ok(source.entries.every(entry => typeof entry.text === 'string'))
  }
})

test('角色别名、单条text及多义消歧按需返回，不加载整个人物库到模型', () => {
  const diona = characterProfiles({ op: 'profile', query: '迪奥娜' }, 1)
  assert.equal(diona.audience, 'GM')
  assert.match(diona.character.text, /角色名：迪奥娜/)
  assert.doesNotMatch(diona.character.text, /角色名：琴/)
  const jean = characterProfiles({ op: 'profile', query: '琴' }, 1)
  assert.match(jean.character.name, /琴/)
  assert.equal(characterProfiles({ op: 'profile', id: jean.character.id }, 1).character.text, jean.character.text)
  const candidates = characterProfiles({ op: 'search', query: '神', limit: 2 }, 9)
  assert.ok(candidates.matches.length <= 2)
  assert.ok(candidates.matches.every(entry => !Object.hasOwn(entry, 'text')))
})

test('限制文件路径、阶段和禁止正文，玩家lore不暴露人物后台', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-npc-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runtime = new Runtime({ root })
  const call = input => runtime.execute({ tool: 'trpg_char', mode: 'solo', slot: 'case', input })
  assert.equal(call({ op: 'profile', query: '迪奥娜' }).character.name, '迪奥娜')
  assert.deepEqual(fs.readdirSync(root), [])
  assert.equal(call({ op: 'profile', query: '那维莱特' }).character, undefined)
  assert.ok(call({ op: 'profile', query: '那维莱特', station: 5 }).character)
  assert.throws(() => call({ op: 'profile', id: '../../secret' }), /id/)
  assert.throws(() => call({ op: 'profile', query: '琴', file: 'gm' }), /路径/)
  assert.throws(() => call({ op: 'search', query: '琴', limit: 100 }), /limit/)
  const index = JSON.parse(fs.readFileSync(new URL('../data/characters/index.json', import.meta.url)))
  for (const entry of index.filter(entry => entry.level.startsWith('禁止'))) assert.equal(characterProfiles({ op: 'profile', id: entry.id }, 9).character, undefined)
  runtime.execute({ tool: 'trpg_save', mode: 'solo', slot: 'case', input: { op: 'new' } })
  const lore = runtime.execute({ tool: 'trpg_lore', mode: 'solo', slot: 'case', input: { query: '凯亚' } })
  assert.doesNotMatch(JSON.stringify(lore), /坎瑞亚遗民/)
  call({ op: 'profile', query: '凯亚' })
  assert.equal(runtime.execute({ tool: 'trpg_save', mode: 'solo', slot: 'case', input: { op: 'load' } }).state.revision, 1)
})
