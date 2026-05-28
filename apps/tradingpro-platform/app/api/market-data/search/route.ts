/**
 * @file route.ts
 * @module market-data
 * @description Server-side proxy for market data search API (prevents API key exposure)
 * @author StockTrade
 * @created 2025-01-29
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

// Base API URL and key (server-side only - never exposed to client)
const BASE_URL = process.env.MARKET_DATA_API_URL || 'https://marketdata.vedpragya.com';
const API_KEY = process.env.MARKET_DATA_API_KEY || 'demo-key-1';

interface SearchParams {
  type: 'equities' | 'futures' | 'options' | 'commodities' | 'universal';
  q?: string;
  limit?: number;
  offset?: number;
  exchange?: string;
  option_type?: 'CE' | 'PE';
  strike_min?: number;
  strike_max?: number;
  expiry_from?: string;
  expiry_to?: string;
}

/**
 * GET /api/market-data/search
 * Proxy search requests to external market data API
 * 
 * Query parameters:
 * - type: 'equities' | 'futures' | 'options' | 'commodities' | 'universal'
 * - q: search query (optional)
 * - limit: max results (optional, default: 20)
 * - offset: pagination offset (optional)
 * - exchange: filter by exchange (optional)
 * - option_type: CE or PE for options (optional)
 * - strike_min: minimum strike price (optional)
 * - strike_max: maximum strike price (optional)
 * - expiry_from: expiry date from YYYYMMDD (optional)
 * - expiry_to: expiry date to YYYYMMDD (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') as SearchParams['type'];
    
    if (!type) {
      return NextResponse.json(
        { error: 'Type parameter is required' },
        { status: 400 }
      );
    }

    // Build endpoint based on type
    let endpoint = '/api/stock/vayu/';
    switch (type) {
      case 'equities':
        endpoint += 'equities';
        break;
      case 'futures':
        endpoint += 'futures';
        break;
      case 'options':
        endpoint += 'options';
        break;
      case 'commodities':
        endpoint += 'commodities';
        break;
      case 'universal':
        endpoint += 'instruments/search';
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid type parameter' },
          { status: 400 }
        );
    }

    // Build query parameters (exclude 'type' as it's for routing)
    const params = new URLSearchParams();
    searchParams.forEach((value, key) => {
      if (key !== 'type') {
        params.append(key, value);
      }
    });

    // Enforce ltp_only=true by default for all search types unless explicitly provided
    if (!params.has('ltp_only')) {
      params.set('ltp_only', 'true');
    }

    // Build full URL
    const url = `${BASE_URL}${endpoint}${params.toString() ? `?${params.toString()}` : ''}`;

    console.log('🔍 [SEARCH-PROXY] Forwarding request', {
      type,
      endpoint,
      hasQuery: params.toString().length > 0,
      url: url.replace(API_KEY, '***'), // Don't log API key
    });

    // Forward request to external API with API key
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      // Add timeout
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ [SEARCH-PROXY] External API error', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      });

      return NextResponse.json(
        {
          error: errorData.error || 'Search request failed',
          statusCode: response.status,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    console.log('✅ [SEARCH-PROXY] Request successful', {
      type,
      count: data.data?.instruments?.length || 0,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('❌ [SEARCH-PROXY] Request failed', error);

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timeout - please try again' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
      },
      { status: 500 }
    );
  }
}
