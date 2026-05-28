/**
 * @file route.ts
 * @module market-data-options
 * @description Server-side Options proxy forwarding to Vedpragya instruments endpoint.
 *              Uses direct instruments search with q parameter for options discovery.
 *              Filters out instruments administratively disabled via MarketControlConfig symbolOverrides.
 * @author StockTrade
 * @created 2025-01-28
 * @updated 2026-04-25
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { loadMarketControlConfig } from '@/lib/market-control/market-control-loader';
import { symbolOverrideKey } from '@/lib/market-control/market-control-config.schema';

// Base API URL and key (server-side only - never exposed to client)
const BASE_URL = process.env.MARKET_DATA_API_URL || 'https://marketdata.vedpragya.com';
const API_KEY = process.env.MARKET_DATA_API_KEY || 'stocktrade-key-1';

/**
 * GET /api/market-data/options
 * Fetch Options instruments for a given search query from external API via server proxy.
 * Uses direct instruments endpoint with q parameter for flexible options search.
 * Defaults: is_active=true, limit=20, offset=0, ltp_only=true, include_ltp=true
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Accept search query from 'q' parameter (required)
    const queryParam = (searchParams.get('q') || '').trim();
    if (!queryParam) {
      return NextResponse.json({ error: 'q (search query) is required' }, { status: 400 });
    }
    const limit = searchParams.get('limit') || '20';
    const offset = searchParams.get('offset') || '0';
    const ltpOnly = searchParams.get('ltp_only') || 'true';
    const includeLtp = searchParams.get('include_ltp') || 'true';
    const isActive = searchParams.get('is_active') || 'true';

    // Build target URL - using direct instruments endpoint with q parameter
    const params = new URLSearchParams();
    params.set('q', queryParam);
    params.set('is_active', String(isActive));
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    params.set('ltp_only', String(ltpOnly));
    params.set('include_ltp', String(includeLtp));

    const url = `${BASE_URL}/api/stock/vayu/instruments?${params.toString()}`;

    try {
      console.log('🔵 [OPTIONS-PROXY] Forwarding request', {
        url,
        query: queryParam,
        limit,
        offset,
        ltpOnly,
        includeLtp,
        isActive,
      });
    } catch {}

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10s timeout
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      try {
        console.error('❌ [OPTIONS-PROXY] External API error', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        });
      } catch {}
      return NextResponse.json(
        {
          error: errorData?.error || 'Options fetch failed',
          statusCode: response.status,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Normalize exchange/segment to NSE_FO for options (best-effort)
    // Filter to only include options (has option_type CE or PE)
    if (data?.data?.instruments && Array.isArray(data.data.instruments)) {
      data.data.instruments = data.data.instruments
        .filter((inst: any) => {
          const optionType = inst?.option_type;
          return optionType === 'CE' || optionType === 'PE';
        })
        .map((inst: any) => {
          const normalizedExchange = inst?.exchange || 'NSE_FO';
          return {
            ...inst,
            exchange: normalizedExchange,
            segment: inst?.segment || normalizedExchange,
          };
        });

      // Filter out instruments disabled in MarketControlConfig (uses in-process cache, no extra DB call)
      const config = await loadMarketControlConfig();
      const disabledKeys = new Set(
        Object.entries(config.symbolOverrides)
          .filter(([, o]) => o.enabled === false)
          .map(([k]) => k),
      );
      if (disabledKeys.size > 0) {
        data.data.instruments = data.data.instruments.filter(
          (inst: any) => !disabledKeys.has(symbolOverrideKey('NSE_FO', inst.symbol ?? '')),
        );
      }
    }

    try {
      console.log('✅ [OPTIONS-PROXY] Options instruments fetched', {
        count: data?.data?.instruments?.length || 0,
      });
    } catch {}

    return NextResponse.json(data);
  } catch (error) {
    try {
      console.error('❌ [OPTIONS-PROXY] Request failed', error);
    } catch {}

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timeout - please try again' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
