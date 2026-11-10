// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/** Routes the reference facilitator must answer. Origin-chain settlement stays offline in CI. */
export const FACILITATOR_ROUTES = ['/health', '/supported', '/verify', '/settle'] as const

export function isFacilitatorRoute(path: string): boolean {
  return (FACILITATOR_ROUTES as readonly string[]).includes(path)
}
