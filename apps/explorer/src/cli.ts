// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { createExplorerServer } from './index.js'

const port = Number(process.env.EXPLORER_PORT ?? 4022)
const server = createExplorerServer()
server.listen(port, () => {
  process.stdout.write(`explorer listening on ${port}\n`)
})
