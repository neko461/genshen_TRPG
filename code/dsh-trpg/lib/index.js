import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createTools } from './tools.js'
export const name = 'dsh-trpg'
export const inject = ['tools', 'userQuestions']
export function apply(ctx) {
  const root = process.env.TRPG_ROOT || fileURLToPath(new URL('../../..', import.meta.url))
  const askPlayer = ctx.userQuestions ? (request) => ctx.userQuestions.ask(request) : undefined
  for (const tool of createTools({ root, askPlayer })) ctx.tools.register(defineTool(tool))
}
