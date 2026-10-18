import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createTools } from './tools.js'
import { Runtime } from '../engine/runtime.js'
import { branchCheckpoint, createCheckpoint, listCheckpoints } from '../engine/checkpoints.js'
export const name = 'dsh-trpg'
export const inject = ['tools', 'userQuestions', 'connection']
export function apply(ctx) {
  const root = process.env.TRPG_ROOT || fileURLToPath(new URL('../../..', import.meta.url))
  const askPlayer = ctx.userQuestions ? (request) => ctx.userQuestions.ask(request) : undefined
  for (const tool of createTools({ root, askPlayer })) ctx.tools.register(defineTool(tool))
  if (ctx.connection?.fetch) {
    const runtime = new Runtime({ root })
    ctx.effect(() => ctx.connection.fetch.register({
      path: '/api/trpg-checkpoints', methods: ['POST'], requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const body = await request.json()
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求必须是JSON对象')
          const { op, mode, slot } = body
          let result
          if (op === 'slots') {
            const slots = runtime.execute({ tool: 'trpg_save', mode, slot: slot || 'dsh_ui', input: { op: 'list' } })
            result = { slots: slots[mode] ?? [] }
          } else if (op === 'list') result = { checkpoints: listCheckpoints(root, mode, slot) }
          else if (op === 'save') result = { checkpoint: createCheckpoint(root, mode, slot, body.name, body.description, body.conversation) }
          else if (op === 'branch') {
            if (body.playerConfirmed !== true) throw new Error('读取回溯点会切换当前测试槽位，须由玩家明确确认')
            result = branchCheckpoint(root, mode, slot, body.checkpointId, body.targetSlot)
          }
          else throw new Error('未知存档操作')
          return Response.json({ ok: true, result })
        } catch (error) {
          return Response.json({ ok: false, error: error.message }, { status: 400 })
        }
      },
    }), 'dsh-trpg: save checkpoint route')
  }
}
