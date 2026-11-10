// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

import { createAgentSession, runOpenAiAgent } from './agent.js'
import { loadConfig } from './config.js'
import { createSourcePayer } from './payer.js'
import { buyAndFetchResource, listResources } from './payment.js'

function usage(): never {
  console.error(
    [
      'Usage:',
      '  node dist/cli.js list',
      '  node dist/cli.js buy <resource-id>',
      '  node dist/cli.js ask "<prompt>"',
      '  node dist/cli.js chat              # interactive REPL with the OpenAI agent',
      '',
      'Environment: MODE=test|live, RESOURCE_BASE_URL, OPENAI_* (for ask/chat), ORIGIN_*',
    ].join('\n'),
  )
  process.exit(2)
}

function formatBuySummary(result: any): string {
  if (!result?.ok) return JSON.stringify(result, null, 2)
  const pf = result.paidFrom ?? {}
  const pt = result.paidTo ?? {}
  return [
    `✓ ${result.resourceId}`,
    `  Paid from (one source wallet): ${pf.singleSourceWallet} on ${pf.originNetwork} - ${pf.amount} (${pf.mode}${pf.mode === 'test' ? ', simulated' : ''})`,
    `  Paid to: ${pt.sellerNetwork} ${pt.sellerAsset ? '' : ''} deposit ${pt.depositAddress} - ${pt.sellerAmount}`,
    `  Tx/hash: ${pf.txHash}`,
    `  Content: ${JSON.stringify(result.result?.content ?? result.result)}`,
  ].join('\n')
}

async function chatRepl(
  payer: ReturnType<typeof createSourcePayer>,
  config: ReturnType<typeof loadConfig>,
) {
  if (!config.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for chat. Use buy/list for direct commands.')
  }
  const session = createAgentSession(payer, config)
  const origin = payer.origin()
  console.log(`x402Interop agent chat (MODE=${config.MODE})`)
  console.log(`Source wallet: ${origin.address} (${origin.network})`)
  console.log('Ask me to list resources, buy reports, etc. Type "exit" to quit.\n')
  const rl = createInterface({ input, output })
  try {
    while (true) {
      const line = (await rl.question('you> ')).trim()
      if (!line) continue
      if (line === 'exit' || line === 'quit') break
      try {
        const answer = await session.send(line)
        console.log(`\nagent> ${answer}\n`)
      } catch (err) {
        console.error(`\nagent error> ${err instanceof Error ? err.message : String(err)}\n`)
      }
    }
  } finally {
    rl.close()
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const args = argv[0] === '--' ? argv.slice(1) : argv
  const [cmd, ...rest] = args
  if (!cmd || cmd === '--help' || cmd === '-h') usage()
  const config = loadConfig(process.env)
  const payer = createSourcePayer(config)

  if (cmd === 'list') {
    console.log(JSON.stringify(await listResources(config), null, 2))
    return
  }
  if (cmd === 'buy') {
    const id = rest[0]
    if (!id) usage()
    console.log(
      `Source wallet: ${payer.origin().address} (${payer.origin().network}) MODE=${config.MODE}`,
    )
    const result = await buyAndFetchResource(id, payer, config)
    console.log(formatBuySummary(result))
    return
  }
  if (cmd === 'ask') {
    const prompt = rest.join(' ').trim()
    if (!prompt) {
      await chatRepl(payer, config)
      return
    }
    const answer = await runOpenAiAgent(prompt, payer, config)
    console.log(answer)
    return
  }
  if (cmd === 'chat') {
    await chatRepl(payer, config)
    return
  }
  usage()
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
