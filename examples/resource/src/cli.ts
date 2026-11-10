// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { loadConfig } from './config.js'
import { createResourceApp } from './server.js'

const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(
    'Usage: node --env-file=.env dist/cli.js  (env: MODE, PORT, ONECLICK_API_KEY, SUI_SELLER_ADDRESS, NEAR_SELLER_ADDRESS)',
  )
  process.exit(0)
}
const config = loadConfig(process.env)
const { server } = createResourceApp(config)

server.listen(config.PORT, '127.0.0.1', () => {
  console.log(
    JSON.stringify(
      {
        status: 'listening',
        mode: config.MODE,
        url: `http://127.0.0.1:${config.PORT}`,
        catalog: `http://127.0.0.1:${config.PORT}/catalog`,
      },
      null,
      2,
    ),
  )
})
