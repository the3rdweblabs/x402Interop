// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

/**
 * The docs navigation. One list drives the sidebar, the footer columns, the
 * previous/next links and the section tabs. A page missing from this list is
 * still published, under "More", so nothing silently disappears.
 */

export interface DocEntry {
  slug: string
  title: string
}

export interface DocSection {
  id: string
  label: string
  /** Path prefix that marks a page as belonging to this section. */
  prefix?: string
  entries: DocEntry[]
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: 'start',
    label: 'Start',
    entries: [
      { slug: 'intro', title: 'Introduction' },
      { slug: 'guides/quickstart', title: 'Quickstart' },
      { slug: 'guides/walkthrough', title: 'Walkthrough' },
    ],
  },
  {
    id: 'guides',
    label: 'Guides',
    entries: [
      { slug: 'guides/seller', title: 'Seller guide' },
      { slug: 'guides/buyer', title: 'Buyer guide' },
      { slug: 'guides/facilitator', title: 'Facilitator guide' },
      { slug: 'guides/mcp', title: 'MCP & agents' },
      { slug: 'guides/deployment', title: 'Deployment' },
      { slug: 'guides/http2', title: 'HTTP/2 & HTTP/3' },
      { slug: 'guides/live-canary', title: 'Live canary' },
    ],
  },
  {
    id: 'concepts',
    label: 'Concepts',
    entries: [
      { slug: 'concept/overview', title: 'Overview' },
      { slug: 'concept/payment-paths', title: 'Payment paths' },
      { slug: 'concept/schemes', title: 'Schemes' },
      { slug: 'concept/wire-format', title: 'Wire format' },
    ],
  },
  {
    id: 'reference',
    label: 'Reference',
    entries: [
      { slug: 'reference/api', title: 'API surface' },
      { slug: 'reference/chains-and-assets', title: 'Chains & assets' },
      { slug: 'reference/security', title: 'Security & trust' },
      { slug: 'reference/oneclick-route-matrix', title: '1Click route matrix' },
      { slug: 'reference/oneclick-swap-lifecycle', title: '1Click swap lifecycle' },
      { slug: 'reference/test-report', title: 'Test report' },
    ],
  },
  {
    id: 'specs',
    label: 'Specs',
    entries: [
      { slug: 'specs/scheme', title: 'Scheme spec' },
      { slug: 'specs/facilitator-api', title: 'Facilitator API' },
    ],
  },
  {
    id: 'schemes',
    label: 'Scheme specs',
    prefix: 'specs/schemes/',
    entries: [{ slug: 'specs/schemes/README', title: 'Overview (mirrored from x402)' }],
  },
]

/** Pages that are published but never listed in navigation. */
export const HIDDEN_SLUGS = new Set(['README'])

export function sectionFor(slug: string): DocSection | undefined {
  const scheme = DOC_SECTIONS.find((section) => section.prefix && slug.startsWith(section.prefix))
  if (scheme) return scheme
  return DOC_SECTIONS.find((section) => section.entries.some((entry) => entry.slug === slug))
}

/** Every listed page in navigation order, for previous and next links. */
export function orderedEntries(): DocEntry[] {
  return DOC_SECTIONS.flatMap((section) => section.entries)
}
