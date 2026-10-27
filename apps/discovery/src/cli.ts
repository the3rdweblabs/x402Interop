// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { createDiscoveryServer } from './index.js'

const port = Number(process.env.DISCOVERY_PORT ?? 4021)
const server = createDiscoveryServer()
server.listen(port, () => {
  process.stdout.write(`discovery listening on ${port}\n`)
})
