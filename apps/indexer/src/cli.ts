// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { createIndexerServer } from './index.js'

const port = Number(process.env.PORT) || 8080
const server = createIndexerServer()
server.listen(port, () => {
  console.log(`Indexer listening on http://localhost:${port}`)
})
