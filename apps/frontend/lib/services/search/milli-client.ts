/**
 * File:        apps/frontend/lib/services/search/milli-client.ts
 * Module:      Milli search client stub
 * Purpose:     Provides MilliInstrument type and milliClient for instrument search.
 *              In the UI-only frontend, search goes through the NestJS REST API.
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-18
 */

export interface MilliInstrument {
  symbol: string
  name: string
  exchange: string
  instrumentToken?: string
  segment?: string
}

export const milliClient = {
  search: async (query: string): Promise<MilliInstrument[]> => {
    const { searchInstruments } = await import("@/lib/api/endpoints/market")
    const results = await searchInstruments(query)
    return results.map((r: any) => ({
      symbol: r.symbol,
      name: r.name || r.symbol,
      exchange: r.exchange,
      instrumentToken: r.instrumentToken,
      segment: r.segment,
    }))
  },
}
