// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

import { MCP_TOOL_NAMES } from './index.js'

process.stdout.write(
  `x402interop mcp scaffold. Tools: ${MCP_TOOL_NAMES.join(', ')}. Stdio transport is not wired yet.\n`,
)
