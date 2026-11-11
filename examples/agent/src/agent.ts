// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import OpenAI from 'openai'

import type { AgentConfig } from './config.js'
import type { SourcePayer } from './payer.js'
import { buyAndFetchResource, listResources } from './payment.js'

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_resources',
      description:
        'List protected resources, their destination payment requirements (seller network/asset/amount), and URLs.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buy_and_fetch_resource',
      description:
        'Pay for a protected resource using the single configured source wallet via x402Interop and return the settled resource content. Handles 402 -> pay -> settle -> fetch.',
      parameters: {
        type: 'object',
        properties: {
          resource_id: {
            type: 'string',
            description: 'Resource id from list_resources, e.g. sui-usdc-report',
          },
        },
        required: ['resource_id'],
        additionalProperties: false,
      },
    },
  },
]

async function runTool(
  name: string,
  args: Record<string, unknown>,
  payer: SourcePayer,
  config: AgentConfig,
) {
  if (name === 'list_resources') return listResources(config)
  if (name === 'buy_and_fetch_resource') {
    const id = String(args.resource_id ?? '')
    if (!id) throw new Error('resource_id is required')
    return buyAndFetchResource(id, payer, config)
  }
  throw new Error(`Unknown tool: ${name}`)
}

function systemPrompt(payer: SourcePayer, config: AgentConfig): string {
  const origin = payer.origin()
  return (
    `You are an x402Interop paying agent for normal users. You have ONE source wallet (${origin.address} on ${origin.network}, asset ${origin.assetId}) and can pay protected resources whose sellers want payment on different destination chains/assets. ` +
    `Use tools to discover resources and buy them. Never fabricate payment receipts. ` +
    `Always explain amounts in human-readable units first (e.g. 0.2 USDC), and mention atomic units only as technical detail if useful. ` +
    `After each purchase, report clearly: resource, paid from (single source wallet, network, human amount), paid to (destination chain/asset, deposit), tx hash/mode, and a short summary of the content received. ` +
    `If MODE is test, clearly say no real money moved and settlement was simulated by the stack. Keep responses concise and friendly. ` +
    `Current mode: ${config.MODE}.`
  )
}

export interface AgentSession {
  send(userText: string): Promise<string>
  messages(): OpenAI.Chat.Completions.ChatCompletionMessageParam[]
}

export function createAgentSession(payer: SourcePayer, config: AgentConfig): AgentSession {
  if (!config.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is required for the OpenAI agent. Use `buy <id>` / `list` for direct commands.',
    )
  }
  const client = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_BASE_URL,
    ...(config.OPENAI_ORG ? { organization: config.OPENAI_ORG } : {}),
    ...(config.OPENAI_PROJECT ? { project: config.OPENAI_PROJECT } : {}),
  })
  const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt(payer, config) },
  ]

  return {
    messages: () => history,
    async send(userText: string): Promise<string> {
      history.push({ role: 'user', content: userText })
      for (let step = 0; step < 8; step++) {
        const completion = await client.chat.completions.create({
          model: config.OPENAI_MODEL,
          messages: history,
          tools,
          tool_choice: 'auto',
          temperature: config.OPENAI_TEMPERATURE,
          max_tokens: config.OPENAI_MAX_TOKENS,
        })
        const message = completion.choices[0]?.message
        if (!message) throw new Error('OpenAI returned no message')
        history.push(message)
        if (!message.tool_calls?.length) return message.content ?? ''
        for (const call of message.tool_calls) {
          let result: unknown
          try {
            if (call.type !== 'function') {
              throw new Error(`Unsupported tool call: ${call.type}`)
            }
            const args = call.function.arguments
              ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
              : {}
            result = await runTool(call.function.name, args, payer, config)
          } catch (err) {
            result = { error: err instanceof Error ? err.message : String(err) }
          }
          history.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result, null, 2),
          })
        }
      }
      return 'Agent stopped after maximum tool steps.'
    },
  }
}

export async function runOpenAiAgent(
  userPrompt: string,
  payer: SourcePayer,
  config: AgentConfig,
): Promise<string> {
  return createAgentSession(payer, config).send(userPrompt)
}
