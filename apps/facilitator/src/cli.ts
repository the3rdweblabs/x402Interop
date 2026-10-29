// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS
// [native]

import { createFacilitatorServer } from './index.js'

const port = Number(process.env.FACILITATOR_PORT ?? 4020)
const server = createFacilitatorServer()
server.listen(port, () => {
  process.stdout.write(`facilitator listening on ${port}\n`)
})
