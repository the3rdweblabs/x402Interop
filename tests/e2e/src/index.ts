// SPDX-License-Identifier: GPL-3.0-or-later
// [native]

/** Routes the scaffold facilitator must answer. Settlement itself is still a stub. */
export const FACILITATOR_ROUTES = ['/health', '/supported', '/verify', '/settle'] as const

export function isFacilitatorRoute(path: string): boolean {
  return (FACILITATOR_ROUTES as readonly string[]).includes(path)
}
