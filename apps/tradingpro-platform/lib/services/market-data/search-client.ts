/**
 * @file search-client.ts
 * @description Market data search API client for instrument discovery
 * 
 * PURPOSE:
 * - Search for equities, futures, options, and MCX commodities
 * - Calls internal Next.js API proxy (server-side handles external API with secure key)
 * - Handle authentication, errors, and response parsing
 * - Support all instrument types with proper typing
 * 
 * SECURITY:
 * - API keys are NEVER exposed to client
 * - All requests go through /api/market-data/search proxy
 * - Server-side proxy adds API key header
 * 
 * USAGE:
 * import { searchEquities, searchFutures } from '@/lib/services/market-data/search-client';
 * 
 * const results = await searchEquities('RELIANCE');
 * 
 * @author Trading Platform Team
 * @date 2025-01-29
 */

// Use internal API proxy (never call external API directly from client)
const PROXY_URL = '/api/market-data/search';

// Search result types
export interface Instrument {
  token: number;
  symbol: string;
  name: string;
  exchange: string;
  segment: string;
  last_price?: number;
  expiry_date?: string; // For F&O
  strike_price?: number; // For options
  option_type?: 'CE' | 'PE'; // For options
  lot_size?: number;
  [key: string]: any; // Allow additional fields
}

export interface SearchResponse {
  success: boolean;
  data: {
    instruments: Instrument[];
    pagination?: {
      total: number;
      hasMore: boolean;
    };
  };
}

/**
 * Error class for search API errors
 */
export class SearchAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'SearchAPIError';
  }
}

/**
 * Make authenticated request through internal API proxy
 * API key is handled server-side - never exposed to client
 */
async function apiRequest<T>(
  type: 'equities' | 'futures' | 'options' | 'commodities' | 'universal',
  params: Record<string, string | number> = {}
): Promise<T> {
  console.log('🔍 [SEARCH-CLIENT] Making request through proxy', { type, params });
  
  try {
    // Build URL with query parameters (use internal proxy)
    // Handle both client-side and SSR contexts
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
    
    const url = new URL(PROXY_URL, baseUrl);
    url.searchParams.append('type', type);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
    
    // Make request to internal proxy (no API key needed - proxy handles it)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for session
    });
    
    console.log('📡 [SEARCH-CLIENT] Response status', response.status);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new SearchAPIError(
        errorData.error || 'Search request failed',
        response.status,
        errorData
      );
    }
    
    const data = await response.json();
    console.log('✅ [SEARCH-CLIENT] Request successful', {
      type,
      count: data.data?.instruments?.length || 0,
    });
    
    return data;
  } catch (error) {
    console.error('❌ [SEARCH-CLIENT] Request failed', error);
    
    if (error instanceof SearchAPIError) {
      throw error;
    }
    
    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new SearchAPIError(
        'Network error - please check your connection',
        0,
        { originalError: error }
      );
    }
    
    throw new SearchAPIError(
      'Network error occurred',
      0,
      { originalError: error }
    );
  }
}

/**
 * Search for equity stocks
 * 
 * @param query - Search query (case-insensitive)
 * @param limit - Maximum results to return
 * @returns Search results
 */
export async function searchEquities(
  query: string,
  limit: number = 20
): Promise<Instrument[]> {
  try {
    console.log('📊 [SEARCH-CLIENT] Searching equities', { query, limit });
    
    const response = await apiRequest<SearchResponse>(
      'equities',
      { q: query, limit }
    );
    
    return response.data?.instruments || [];
  } catch (error) {
    console.error('❌ [SEARCH-CLIENT] Equities search failed', error);
    throw error;
  }
}

/**
 * Search for futures
 * 
 * @param query - Search query (case-insensitive)
 * @param limit - Maximum results to return
 * @returns Search results
 */
export async function searchFutures(
  query: string,
  limit: number = 20
): Promise<Instrument[]> {
  try {
    console.log('📊 [SEARCH-CLIENT] Searching futures', { query, limit });
    
    const response = await apiRequest<SearchResponse>(
      'futures',
      { q: query, limit }
    );
    
    return response.data?.instruments || [];
  } catch (error) {
    console.error('❌ [SEARCH-CLIENT] Futures search failed', error);
    throw error;
  }
}

/**
 * Search for options
 * 
 * @param query - Search query (case-insensitive)
 * @param optionType - CE or PE
 * @param limit - Maximum results to return
 * @returns Search results
 */
export async function searchOptions(
  query: string,
  optionType?: 'CE' | 'PE',
  limit: number = 20
): Promise<Instrument[]> {
  try {
    console.log('📊 [SEARCH-CLIENT] Searching options', { query, optionType, limit });
    
    const params: Record<string, string | number> = { q: query, limit };
    if (optionType) {
      params.option_type = optionType;
    }
    
    const response = await apiRequest<SearchResponse>(
      'options',
      params
    );
    
    return response.data?.instruments || [];
  } catch (error) {
    console.error('❌ [SEARCH-CLIENT] Options search failed', error);
    throw error;
  }
}

/**
 * Search for MCX commodities
 * 
 * @param query - Search query (case-insensitive)
 * @param limit - Maximum results to return
 * @returns Search results
 */
export async function searchCommodities(
  query: string,
  limit: number = 20
): Promise<Instrument[]> {
  try {
    console.log('📊 [SEARCH-CLIENT] Searching commodities', { query, limit });
    
    const response = await apiRequest<SearchResponse>(
      'commodities',
      { q: query, limit }
    );
    
    return response.data?.instruments || [];
  } catch (error) {
    console.error('❌ [SEARCH-CLIENT] Commodities search failed', error);
    throw error;
  }
}

/**
 * Search across all instrument types
 * 
 * @param query - Search query (case-insensitive)
 * @param limit - Maximum results per type
 * @returns Search results grouped by type
 */
export async function searchAll(
  query: string,
  limit: number = 20
): Promise<{
  equities: Instrument[];
  futures: Instrument[];
  options: Instrument[];
  commodities: Instrument[];
}> {
  console.log('📊 [SEARCH-CLIENT] Searching all instrument types', { query, limit });
  
  try {
    const [equities, futures, options, commodities] = await Promise.all([
      searchEquities(query, limit).catch(() => []),
      searchFutures(query, limit).catch(() => []),
      searchOptions(query, undefined, limit).catch(() => []),
      searchCommodities(query, limit).catch(() => []),
    ]);
    
    console.log('✅ [SEARCH-CLIENT] Search complete', {
      equities: equities.length,
      futures: futures.length,
      options: options.length,
      commodities: commodities.length,
    });
    
    return { equities, futures, options, commodities };
  } catch (error) {
    console.error('❌ [SEARCH-CLIENT] All search failed', error);
    throw error;
  }
}

/**
 * Get instrument by token (for quick lookup)
 * Currently not available in API, but placeholder for future
 */
export async function getInstrumentByToken(
  token: number
): Promise<Instrument | null> {
  console.warn('⚠️ [SEARCH-CLIENT] getInstrumentByToken not yet implemented');
  return null;
}
