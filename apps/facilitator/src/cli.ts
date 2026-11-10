// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createFacilitatorServer, createFacilitatorServerWithPersistence } from './index.js'

const port = Number(process.env.FACILITATOR_PORT ?? 4020)
const startup =
  process.env.FACILITATOR_STORAGE === 'postgres' || process.env.NODE_ENV === 'production'
    ? createFacilitatorServerWithPersistence()
    : Promise.resolve({ server: createFacilitatorServer(), close: async () => {} })

startup
  .then(({ server, close }) => {
    server.listen(port, () => {
      process.stdout.write(`facilitator listening on ${port}\n`)
    })
    const shutdown = () => {
      server.close(() => {
        void close()
      })
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
