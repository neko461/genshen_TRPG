import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const root = fileURLToPath(new URL('../../..', import.meta.url))
const out = path.join(root, 'releases', 'genshen_TRPG_v0.01')
if (fs.existsSync(out)) throw new Error('版本目录已存在，不会覆盖；请先核对已有交付')
fs.mkdirSync(out, { recursive: true })
const manifest = []
function copyFile(relative) {
  const source = path.join(root, relative)
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error(`不能打包符号链接 ${relative}`)
  const destination = path.join(out, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  const data = fs.readFileSync(source)
  fs.writeFileSync(destination, data, { flag: 'wx' })
  manifest.push({ path: relative.replaceAll('\\', '/'), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') })
}
function copyDir(relative, allowed = () => true) {
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`不能打包符号链接 ${name}`)
    if (entry.isDirectory()) copyDir(name, allowed)
    else if (allowed(name)) copyFile(name)
  }
}
for (const dir of ['engine', 'lib', 'data', 'server', 'web', 'scripts', 'bin', 'prompt', 'test']) copyDir(`code/dsh-trpg/${dir}`)
for (const file of ['package.json', 'cordis.patch.yml', 'README.md', 'DESIGN.md']) copyFile(`code/dsh-trpg/${file}`)
for (const dir of ['center_setting', 'character_setting', 'world_setting', 'light_rule', 'user']) copyDir(dir, (p) => /\.(md|json)$/.test(p))
for (const file of ['README.md', '启动首轮测试.cmd', '第一轮测试指南.md', '版本说明-v0.01.md', '测试验收-v0.01.md', '数值定稿v1.0.md', '时间轴.md', '格式规范.md']) copyFile(file)
if (fs.existsSync(path.join(root, '试玩预览.png'))) copyFile('试玩预览.png')
fs.mkdirSync(path.join(out, 'save'), { recursive: true })
fs.writeFileSync(path.join(out, 'MANIFEST.json'), JSON.stringify({ version: 'genshen_TRPG_v0.01', builtAt: new Date().toISOString(), files: manifest }, null, 2) + '\n')
console.log(`交付目录：${out}\n${manifest.length} 个文件；不包含存档、历史归档、记忆日志、依赖目录或密钥。`)
