// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { createDiscoveryServer } from './server.js'

const port = Number(process.env.PORT) || 8081
const server = createDiscoveryServer()
server.listen(port, () => {
  console.log(`Discovery listening on http://localhost:${port}`)
})
