// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
// [native]

import { z } from 'zod'

export type ServiceHealth = 'healthy' | 'unhealthy' | 'unknown'

/** Normalised catalog entry. Description text is untrusted. */
export interface ServiceRecord {
  id: string
  name: string
  description: string
  price: string
  networks: string[]
  asset: string
  health: ServiceHealth
  source: string
  category?: string
  resourceUrl?: string
}

export interface SearchQuery {
  q?: string
  network?: string
  asset?: string
  maxPrice?: string
  category?: string
  limit?: number
}

export const serviceRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  price: z.string().regex(/^\d+(\.\d+)?$/),
  networks: z.array(z.string().min(1)).min(1),
  asset: z.string().min(1),
  health: z.enum(['healthy', 'unhealthy', 'unknown']),
  source: z.string().min(1),
  category: z.string().min(1).optional(),
  resourceUrl: z.url().optional(),
})

export function parseServiceRecord(value: unknown): ServiceRecord {
  return serviceRecordSchema.parse(value)
}

/** In-memory index. Crawling other catalogs is left for a later phase. */
export class MemoryDiscoveryIndex {
  private readonly services = new Map<string, ServiceRecord>()

  register(service: ServiceRecord): void {
    this.services.set(service.id, service)
  }

  get(id: string): ServiceRecord | undefined {
    return this.services.get(id)
  }

  search(query: SearchQuery = {}): ServiceRecord[] {
    const limit = query.limit ?? 20
    const needle = query.q?.toLowerCase()
    const max = query.maxPrice === undefined ? undefined : Number(query.maxPrice)
    const results: ServiceRecord[] = []
    for (const service of this.services.values()) {
      if (needle && !`${service.name} ${service.description}`.toLowerCase().includes(needle))
        continue
      if (query.network && !service.networks.includes(query.network)) continue
      if (query.asset && service.asset !== query.asset) continue
      if (query.category && service.category !== query.category) continue
      if (max !== undefined && Number.isFinite(max) && Number(service.price) > max) continue
      results.push(service)
      if (results.length >= limit) break
    }
    return results
  }
}
