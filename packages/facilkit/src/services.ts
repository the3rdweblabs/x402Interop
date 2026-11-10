// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { z } from 'zod'

import { isHttpUrl } from './url-guard.js'

export { z }

export type ServiceHealth = 'healthy' | 'unhealthy' | 'unknown'

/** A marketplace listing served by the facilitator's discovery endpoints. */
export interface ServiceRecord {
  id: string
  name: string
  description: string
  price: string
  networks: string[]
  asset: string
  /**
   * CAIP-10 identity of whoever registered the listing
   * (`<namespace>:<reference>:<address>`). An identity, never a payout address.
   */
  owner: string
  /**
   * Where the seller is paid. A bare address that must be valid on every
   * network in `networks`. Absent on listings that have not supplied one.
   */
  payTo?: string
  resourceUrl: string
  category?: string
  tags?: string[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  documentationUrl?: string
  repositoryUrl?: string
  verified?: boolean
  updatedAt?: string
  healthCheckedAt?: string
  healthMessage?: string
  health: ServiceHealth
}

export const serviceRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  price: z.string().regex(/^\d+(\.\d+)?$/),
  networks: z.array(z.string().min(1)).min(1),
  asset: z.string().min(1),
  owner: z.string().min(1),
  payTo: z.string().min(1).optional(),
  resourceUrl: z.url().refine(isHttpUrl, 'resourceUrl must be http(s)'),
  category: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).max(32).optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  documentationUrl: z.url().refine(isHttpUrl, 'documentationUrl must be http(s)').optional(),
  repositoryUrl: z.url().refine(isHttpUrl, 'repositoryUrl must be http(s)').optional(),
  verified: z.boolean().optional(),
  updatedAt: z.iso.datetime().optional(),
  healthCheckedAt: z.iso.datetime().optional(),
  healthMessage: z.string().max(500).optional(),
  health: z.enum(['healthy', 'unhealthy', 'unknown']).default('unknown'),
})

export function parseServiceRecord(value: unknown): ServiceRecord {
  return serviceRecordSchema.parse(value) as ServiceRecord
}

export interface ServiceQuery {
  q?: string
  network?: string
  asset?: string
  category?: string
  maxPrice?: string
  owner?: string
  limit?: number
  offset?: number
}

export interface PagedResult<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

/** Slug used for a record id when the caller does not supply one. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

/**
 * In-memory marketplace catalog on the facilitator. Listings persist in the
 * facilitator's `FileStore` (`services` key) across restarts when the store
 * is file-backed; nothing here performs I/O by itself.
 */
export class MemoryServicesCatalog {
  private readonly services = new Map<string, ServiceRecord>()

  /** Hydrate the catalog from a store snapshot (array of records). */
  load(records: unknown): void {
    if (!Array.isArray(records)) return
    for (const record of records) {
      try {
        const parsed = parseServiceRecord(record)
        this.services.set(parsed.id, parsed)
      } catch {
        // Skip malformed entries; never fail startup.
      }
    }
  }

  snapshot(): ServiceRecord[] {
    return [...this.services.values()]
  }

  register(record: ServiceRecord): ServiceRecord {
    const next = { ...record, updatedAt: record.updatedAt ?? new Date().toISOString() }
    this.services.set(next.id, next)
    return next
  }

  get(id: string): ServiceRecord | undefined {
    return this.services.get(id)
  }

  update(id: string, record: ServiceRecord): ServiceRecord | undefined {
    if (!this.services.has(id)) return undefined
    const next = { ...record, id, updatedAt: new Date().toISOString() }
    this.services.set(id, next)
    return next
  }

  remove(id: string): boolean {
    return this.services.delete(id)
  }

  search(query: ServiceQuery = {}): PagedResult<ServiceRecord> {
    const needle = query.q?.toLowerCase()
    const max = query.maxPrice === undefined ? undefined : Number(query.maxPrice)
    const filtered = [...this.services.values()].filter((service) => {
      if (needle && !`${service.name} ${service.description}`.toLowerCase().includes(needle))
        return false
      if (query.network && !service.networks.includes(query.network)) return false
      if (query.asset && service.asset !== query.asset) return false
      if (query.category && service.category !== query.category) return false
      if (query.owner && service.owner !== query.owner) return false
      if (max !== undefined && Number.isFinite(max) && Number(service.price) > max) return false
      return true
    })
    const limit = Math.max(1, query.limit ?? 20)
    const offset = Math.max(0, query.offset ?? 0)
    return {
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
      limit,
      offset,
    }
  }

  merchants(): Array<{ owner: string; count: number; networks: string[]; assets: string[] }> {
    const byOwner = new Map<string, { count: number; networks: Set<string>; assets: Set<string> }>()
    for (const service of this.services.values()) {
      const entry = byOwner.get(service.owner) ?? {
        count: 0,
        networks: new Set(),
        assets: new Set(),
      }
      entry.count += 1
      for (const network of service.networks) entry.networks.add(network)
      entry.assets.add(service.asset)
      byOwner.set(service.owner, entry)
    }
    return [...byOwner.entries()].map(([owner, entry]) => ({
      owner,
      count: entry.count,
      networks: [...entry.networks],
      assets: [...entry.assets],
    }))
  }
}
