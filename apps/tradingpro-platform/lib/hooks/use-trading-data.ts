/**
 * @file use-trading-data.ts
 * @description Centralized hooks for fetching and managing all trading data.
 * This file has been heavily revised to implement a fully functional user-specific watchlist,
 * remove polling in favor of manual refetching, and ensure all GraphQL operations
 * align with the provided Prisma schema.
 *
 * @updated 2026-04-08 — Removed unused client-side `computeCharges` / `computeRequiredMargin` (F&O margin is server-side + risk config; see `use-order-form`).
 */
"use client"

import { useQuery } from "@apollo/client/react"
import { gql } from "@apollo/client/core"
import client from "@/lib/graphql/apollo-client"
import { useMemo } from "react"
import useSWR from 'swr'
// Use client-safe literal types instead of importing Prisma enums at runtime
export type ClientOrderType = "MARKET" | "LIMIT"
export type ClientOrderSide = "BUY" | "SELL"
import { Calculator } from "lucide-react"
import { createLoggerFromSession, LogLevel, LogCategory } from "@/lib/logger"
import {
  parseFiniteMarketNumber,
  parsePositiveIntegerMarketNumber,
} from "@/lib/market-data/utils/quote-lookup"

/** Best-effort JSON body for API error responses; avoids throw on HTML/plain errors. */
async function readResponseBodyJsonSafe(response: Response): Promise<unknown | null> {
  try {
    const text = await response.text()
    if (!text.trim()) {
      return null
    }
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  } catch {
    return null
  }
}

function resolveTradingApiErrorMessage(payload: unknown, response: Response, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim()
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    const fromError = record.error
    if (typeof fromError === "string" && fromError.trim()) {
      return fromError.trim()
    }
    const fromMessage = record.message
    if (typeof fromMessage === "string" && fromMessage.trim()) {
      return fromMessage.trim()
    }
  }
  const statusText = response.statusText?.trim()
  if (statusText) {
    return `${fallback} (${statusText})`
  }
  return fallback
}

// --- Funds Management Functions ---
async function manageFunds(tradingAccountId: string, amount: number, type: 'BLOCK' | 'RELEASE' | 'CREDIT' | 'DEBIT') {
  try {
    const response = await fetch('/api/trading/funds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradingAccountId, amount, type })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to manage funds')
    }

    return true
  } catch (error) {
    console.error('Fund management error:', error)
    throw error
  }
}

function calculateMarginRequired(price: number, quantity: number, segment: string, orderType: string = 'CNC') {
  const baseValue = quantity * price

  if (segment === 'NSE') {
    return orderType === 'MIS' ? baseValue / 200 : baseValue / 50 // 200x leverage for MIS, 50x for CNC
  }

  if (segment === 'NFO') {
    return baseValue / 100 // 100x leverage for F&O
  }

  return baseValue // Full margin for others
}

// -----------------------------
// GraphQL Documents (Corrected for Prisma Schema)
// -----------------------------

// --- User & Account ---
const GET_USER = gql`
  query GetUser($id: UUID!) {
    usersCollection(filter: { id: { eq: $id } }) {
      edges { node { id, email, name, role } }
    }
  }
`

const INSERT_USER = gql`
  mutation InsertUser($objects: [usersInsertInput!]!) {
    insertIntousersCollection(objects: $objects) {
      records { id, email, name }
    }
  }
`

const GET_ACCOUNT_BY_USER = gql`
  query GetAccountByUser($userId: UUID!) {
    trading_accountsCollection(filter: { userId: { eq: $userId } }) {
      edges {
        node { id, userId, balance, availableMargin, usedMargin, client_id }
      }
    }
  }
`

const GET_ACCOUNT_BY_ID = gql`
  query GetAccountById($id: UUID!) {
    trading_accountsCollection(filter: { id: { eq: $id } }, first: 1) {
      edges { node { id, balance, availableMargin, usedMargin } }
    }
  }
`

const INSERT_ACCOUNT = gql`
  mutation InsertAccount($objects: [trading_accountsInsertInput!]!) {
    insertIntotrading_accountsCollection(objects: $objects) {
      records { id, userId, balance, availableMargin }
    }
  }
`

// --- Positions ---
const GET_POSITIONS = gql`
  query GetPositions($tradingAccountId: UUID!) {
    positionsCollection(
      filter: { tradingAccountId: { eq: $tradingAccountId } }
      orderBy: [{ createdAt: DescNullsLast }]
    ) {
      edges {
        node {
          id, symbol, quantity, averagePrice, stopLoss, target, unrealizedPnL, dayPnL
          stock { 
            instrumentId, segment, strikePrice, optionType, expiry, lot_size
          }
        }
      }
    }
  }
`

const UPDATE_POSITION = gql`
  mutation UpdatePosition($id: UUID!, $set: positionsUpdateInput!) {
    updatepositionsCollection(set: $set, filter: { id: { eq: $id } }) {
      records { id, stopLoss, target , unrealizedPnL, dayPnL}
    }
  }
`

const DELETE_POSITION = gql`
  mutation DeletePosition($id: UUID!) {
    deleteFrompositionsCollection(filter: { id: { eq: $id } }) {
      affectedCount
    }
  }
`
const GET_POSITION_BY_SYMBOL = gql`
  query GetPositionBySymbol($tradingAccountId: UUID!, $symbol: String!) {
    positionsCollection(filter: { tradingAccountId: { eq: $tradingAccountId }, symbol: { eq: $symbol } }) {
      edges { node { id, quantity, averagePrice } }
    }
  }
`
const INSERT_POSITION = gql`
  mutation InsertPosition($objects: [positionsInsertInput!]!) {
    insertIntopositionsCollection(objects: $objects) {
      records { id, symbol, quantity }
    }
  }
`

// --- Orders ---
const GET_ORDERS = gql`
  query GetOrders($tradingAccountId: UUID!) {
    ordersCollection(
      filter: { tradingAccountId: { eq: $tradingAccountId } }
      orderBy: [{ createdAt: DescNullsLast }]
    ) {
      edges {
        node {
          id, symbol, quantity, orderType, orderSide, price, filledQuantity, averagePrice, productType, status, createdAt, executedAt
        }
      }
    }
  }
`
const INSERT_ORDER = gql`
  mutation InsertOrder($objects: [ordersInsertInput!]!) {
    insertIntoordersCollection(objects: $objects) {
      records { id, symbol, status }
    }
  }
`
const UPDATE_ORDER = gql`
  mutation UpdateOrder($id: UUID!, $set: ordersUpdateInput!) {
    updateordersCollection(set: $set, filter: { id: { eq: $id } }) {
      records { id, status }
    }
  }
`
const DELETE_ORDER = gql`
  mutation DeleteOrder($id: UUID!) {
    deleteFromordersCollection(filter: { id: { eq: $id } }) {
      affectedCount
    }
  }
`

// --- Stock Search ---
const SEARCH_STOCKS = gql`
  query SearchStocks($query: String!) {
    stockCollection(
      filter: { and: [
        { isActive: { eq: true } },
        { or: [ { name: { ilike: $query } }, { ticker: { ilike: $query } }, { symbol: { ilike: $query } } ] }
      ]},
      first: 10
    ) {
      edges {
        node { id, instrumentId, ticker, name, ltp, change, changePercent, sector, exchange, segment, strikePrice, optionType, expiry, lot_size }
      }
    }
  }
`

const SEARCH_STOCKS_EQUITY = gql`
  query SearchStocksEquity($query: String!) {
    stockCollection(
      filter: { and: [
        { isActive: { eq: true } },
        { or: [ { name: { ilike: $query } }, { ticker: { ilike: $query } }, { symbol: { ilike: $query } } ] },
        { or: [ { segment: { eq: "NSE" } }, { segment: { eq: "NSE_EQ" } } ] }
      ]},
      first: 20
    ) {
      edges { node { id, instrumentId, ticker, name, ltp, change, changePercent, exchange, segment, lot_size } }
    }
  }
`

const SEARCH_STOCKS_FUTURES = gql`
  query SearchStocksFutures($query: String!) {
    stockCollection(
      filter: { and: [
        { isActive: { eq: true } },
        { or: [ { name: { ilike: $query } }, { ticker: { ilike: $query } }, { symbol: { ilike: $query } } ] },
        { segment: { eq: "NFO" } },
        { optionType: { is: NULL } }
      ]},
      first: 20
    ) {
      edges { node { id, instrumentId, ticker, name, ltp, change, changePercent, exchange, segment, expiry, lot_size } }
    }
  }
`

const SEARCH_STOCKS_OPTIONS = gql`
  query SearchStocksOptions($query: String!) {
    stockCollection(
      filter: { and: [
        { isActive: { eq: true } },
        { or: [ { name: { ilike: $query } }, { ticker: { ilike: $query } }, { symbol: { ilike: $query } } ] },
        { segment: { eq: "NFO" } },
        { optionType: { is: NOT_NULL } }
      ]},
      first: 20
    ) {
      edges { node { id, instrumentId, ticker, name, ltp, change, changePercent, exchange, segment, strikePrice, optionType, expiry, lot_size } }
    }
  }
`

// --- Watchlist (Corrected & Implemented) ---
const GET_USER_WATCHLIST = gql`
  query GetUserWatchlist($userId: UUID!) {
    watchlistCollection(filter: { userId: { eq: $userId } }, first: 1) {
      edges {
        node {
          id
          name
          watchlistItemCollection {
            edges {
              node {
                id # This is the watchlistItemId
                stockId
                token
                symbol
                exchange
                segment
                name
                ltp
                close
                strikePrice
                optionType
                expiry
                lotSize
              }
            }
          }
        }
      }
    }
  }
`

const CREATE_WATCHLIST = gql`
    mutation CreateWatchlist($userId: UUID!, $name: String!) {
        insertIntoWatchlistCollection(objects: [{ userId: $userId, name: $name }]) {
            records { id }
        }
    }
`

const ADD_WATCHLIST_ITEM = gql`
  mutation AddWatchlistItem($watchlistId: UUID!, $stockId: UUID!) {
    insertIntoWatchlistItemCollection(objects: [{ watchlistId: $watchlistId, stockId: $stockId }]) {
      records { id }
    }
  }
`

const REMOVE_WATCHLIST_ITEM = gql`
  mutation RemoveWatchlistItem($id: UUID!) {
    deleteFromWatchlistItemCollection(filter: { id: { eq: $id } }) {
      affectedCount
    }
  }
`
const UPDATE_TRADING_ACCOUNT = gql`
  mutation UpdateTradingAccount($id: UUID!, $set: trading_accountsUpdateInput!) {
    updatetrading_accountsCollection(
      filter: { id: { eq: $id } }
      set: $set
    ) {
      affectedCount
      records {
        id
        balance
        availableMargin
        usedMargin
      }
    }
  }
`;




const INSERT_TRANSACTION = gql`
  mutation InsertTransaction($object: TransactionInsertInput!) {
    insertIntotransactionsCollection(objects: [$object]) {
      records {
        id
      }
    }
  }
`;

const GET_TRANSACTIONS = gql`
  query GetTransactions($tradingAccountId: UUID!) {
    transactionsCollection(
      filter: { tradingAccountId: { eq: $tradingAccountId } }
      orderBy: [{ createdAt: DescNullsLast }]
      first: 100
    ) {
      edges {
        node {
          id
          amount
          type
          description
          createdAt
        }
      }
    }
  }
`

// --- Combined Orders & Positions Query ---
const GET_ORDERS_AND_POSITIONS = gql`
  query GetOrdersAndPositions($tradingAccountId: UUID!) {
    ordersCollection(
      filter: { tradingAccountId: { eq: $tradingAccountId } }
      orderBy: [{ createdAt: DescNullsLast }]
    ) {
      edges {
        node {
          id, symbol, quantity, orderType, orderSide, price, filledQuantity, averagePrice, productType, status, createdAt, executedAt
        }
      }
    }
    positionsCollection(
      filter: { tradingAccountId: { eq: $tradingAccountId } }
      orderBy: [{ createdAt: DescNullsLast }]
    ) {
      edges {
        node {
          id, symbol, quantity, averagePrice, stopLoss, target, unrealizedPnL, dayPnL
          stock {
            instrumentId, segment, strikePrice, optionType, expiry, lot_size
          }
        }
      }
    }
  }
`

const GET_POSITION_BY_ID = gql`
  query GetPositionById($id: UUID!) {
    positionsCollection(filter: { id: { eq: $id } }, first: 1) {
      edges {
        node {
          id
          tradingAccountId
          symbol
          quantity
          averagePrice
          stock { instrumentId, segment }
          unrealizedPnL
          dayPnL
          stopLoss
          target
        }
      }
    }
  }
`

// Latest executed order for a symbol to infer productType for margin reversal
const GET_LAST_EXECUTED_ORDER_FOR_SYMBOL = gql`
  query GetLastExecutedOrderForSymbol($tradingAccountId: UUID!, $symbol: String!) {
    ordersCollection(
      filter: { and: [
        { tradingAccountId: { eq: $tradingAccountId } },
        { symbol: { eq: $symbol } },
        { status: { eq: EXECUTED } }
      ]}
      orderBy: [{ createdAt: DescNullsLast }]
      first: 1
    ) {
      edges {
        node { id, productType }
      }
    }
  }
`

// -----------------------------
// Helper functions
// -----------------------------

const toNumber = (v: any): number => {
  return parseFiniteMarketNumber(v) ?? 0
}

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}


async function ensureUserAndAccount(
  apolloClient: any,
  userId: string,
  userName?: string | null,
  userEmail?: string | null,
  defaultFunding = 250000
): Promise<{ tradingAccountId: string }> {
  try {
    const { data: userRes } = await apolloClient.query({ query: GET_USER, variables: { id: userId }, fetchPolicy: "network-only" })
    if ((userRes?.usersCollection?.edges?.length ?? 0) === 0) {
      await apolloClient.mutate({ mutation: INSERT_USER, variables: { objects: [{ id: userId, email: userEmail, name: userName, isActive: true, role: "USER" }] } })
    }

    const { data: acctRes } = await apolloClient.query({ query: GET_ACCOUNT_BY_USER, variables: { userId }, fetchPolicy: "network-only" })
    const acctNode = acctRes?.trading_accountsCollection?.edges?.[0]?.node
    if (acctNode?.id) {
      return { tradingAccountId: acctNode.id }
    }

    const accountId = generateUUID()
    await apolloClient.mutate({ mutation: INSERT_ACCOUNT, variables: { objects: [{ id: accountId, userId, balance: defaultFunding, availableMargin: defaultFunding, usedMargin: 0 }] } })
    return { tradingAccountId: accountId }
  } catch (error) {
    console.error("Error in ensureUserAndAccount:", error)
    throw new Error("Failed to initialize user account")
  }
}

async function createOrUpdatePosition(apolloClient: any, executedOrder: { tradingAccountId: string, symbol: string, quantity: number, orderSide: "BUY" | "SELL", price: string, stockId?: string | null }) {
  const { data } = await apolloClient.query({ query: GET_POSITION_BY_SYMBOL, variables: { tradingAccountId: executedOrder.tradingAccountId, symbol: executedOrder.symbol }, fetchPolicy: "network-only" })
  const existingPosition = data.positionsCollection?.edges?.[0]?.node
  const orderPrice = parseFiniteMarketNumber(executedOrder.price) ?? 0

  if (existingPosition) {
    const currentQty = parseFiniteMarketNumber(existingPosition.quantity) ?? 0
    const currentAvgPrice = toNumber(existingPosition.averagePrice)
    const orderQty = executedOrder.orderSide === "BUY" ? executedOrder.quantity : -executedOrder.quantity
    const newQty = currentQty + orderQty

    if (newQty === 0) {
      await apolloClient.mutate({ mutation: DELETE_POSITION, variables: { id: existingPosition.id } })
    } else {
      const newAvgPrice = (currentAvgPrice * Math.abs(currentQty) + orderPrice * Math.abs(orderQty)) / (Math.abs(currentQty) + Math.abs(orderQty));
      await apolloClient.mutate({ mutation: UPDATE_POSITION, variables: { id: existingPosition.id, set: { quantity: newQty, averagePrice: newAvgPrice.toFixed(2) } } })
    }
  } else {
    const quantity = executedOrder.orderSide === "BUY" ? executedOrder.quantity : -executedOrder.quantity
    await apolloClient.mutate({ mutation: INSERT_POSITION, variables: { objects: [{ id: generateUUID(), tradingAccountId: executedOrder.tradingAccountId, symbol: executedOrder.symbol, quantity: quantity, averagePrice: orderPrice.toFixed(2), stockId: executedOrder.stockId, }] } })
  }
}

// -----------------------------
// Data Hooks
// -----------------------------

// 15s hard timeout for inline SWR fetchers below. Without it, a hung backend
// leaves SWR's promise pending forever and consumers (console account section,
// orders/positions list) display stale data with no error feedback. Aligns
// with the same pattern in use-realtime-orders / positions / account.
const TRADING_DATA_FETCHER_TIMEOUT_MS = 15_000

export function usePortfolio(userId?: string, userName?: string | null, userEmail?: string | null) {
  // Use SWR with Prisma-based API instead of GraphQL
  const { data, error, isLoading, mutate } = useSWR<any>(
    userId ? `/api/trading/account?userId=${userId}` : null,
    async (url: string) => {
      const res = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(TRADING_DATA_FETCHER_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error('Failed to fetch account')
      return res.json()
    },
    {
      refreshInterval: 0,
      revalidateOnFocus: true,
      focusThrottleInterval: 60_000,
      revalidateOnReconnect: true,
    }
  )

  const account = data?.account
  const balance = toNumber(account?.balance)
  const usedMargin = toNumber(account?.usedMargin)
  const availableMargin = toNumber(account?.availableMargin)
  const totalValue = balance || (availableMargin + usedMargin)
  const client_id = account?.clientId || ""
  const isInitialLoading = isLoading && !data
  const isRefreshing = isLoading && !!data

  return {
    portfolio: account ? { account: { id: account.id, totalValue, availableMargin, usedMargin, balance, client_id } } : null,
    isLoading: isInitialLoading,
    isRefreshing,
    isError: !!error,
    error,
    mutate
  }
}

export function useUserWatchlist(userId?: string) {
  const tradingAccountId = useAccountId(userId)
  const { data, loading, error, refetch } = useQuery<any>(GET_USER_WATCHLIST, {
    variables: { userId: userId ?? "" },
    skip: !userId,
    errorPolicy: "all",
    notifyOnNetworkStatusChange: true,
  });

  const watchlist = useMemo(() => {
    try {
      console.log('🔄 [TRADING-DATA] useUserWatchlist useMemo triggered', {
        hasData: !!data,
        edgesCount: data?.watchlistCollection?.edges?.length || 0,
      })

      const wlNode = data?.watchlistCollection?.edges?.[0]?.node;
      if (!wlNode) {
        console.log('⚠️ [TRADING-DATA] No watchlist node found, returning empty watchlist')
        return { id: null, name: 'My Watchlist', items: [] };
      }

      const itemEdges = wlNode.watchlistItemCollection?.edges || []
      console.log(`📋 [TRADING-DATA] Processing ${itemEdges.length} items for watchlist ${wlNode.id}`)

      // Filter out null/undefined items before mapping to prevent React Error #310
      const items = itemEdges
        .filter((e: any, index: number) => {
          if (!e?.node) {
            console.warn(`⚠️ [TRADING-DATA] Item edge ${index + 1} has null node, filtering out`)
            return false
          }
          return true
        })
        .map((e: any, index: number) => {
          try {
            // Read all fields directly from WatchlistItem (no Stock dependency)
            const item = e.node
            if (!item || !item.id) {
              console.warn(`⚠️ [TRADING-DATA] Skipping invalid WatchlistItem node ${index + 1}:`, {
                item,
                hasId: !!item?.id,
              })
              return null // Will be filtered out
            }
            
            // Generate instrumentId from exchange and token
            let instrumentId: string
            try {
              instrumentId = item.token && item.exchange 
                ? `${item.exchange}-${item.token}` 
                : `unknown-${item.id}`
            } catch (err: any) {
              console.error(`❌ [TRADING-DATA] Error generating instrumentId for item ${index + 1}:`, err)
              instrumentId = `unknown-${item.id}`
            }
            
            const transformedItem = {
              watchlistItemId: item.id,
              id: item.id, // Use WatchlistItem.id as item identifier
              stockId: item.stockId || null,
              instrumentId,
              token: parsePositiveIntegerMarketNumber(item.token) ?? undefined,
              symbol: item.symbol || 'UNKNOWN', // Fallback for null/undefined
              name: item.name || 'Unknown', // Fallback for null/undefined
              ltp: toNumber(item.ltp),
              close: toNumber(item.close),
              exchange: item.exchange || 'NSE', // Fallback for null/undefined
              segment: item.segment || item.exchange || 'NSE', // Fallback for null/undefined
              strikePrice: item.strikePrice != null ? toNumber(item.strikePrice) : undefined,
              optionType: item.optionType,
              expiry: item.expiry,
              lotSize: item.lotSize != null ? toNumber(item.lotSize) : undefined,
              lot_size: item.lotSize != null ? toNumber(item.lotSize) : undefined,
              metadataSource: 'watchlist-item'
            }

            // Warn if token is missing - this is required for WebSocket price updates
            if (!transformedItem.token) {
              console.warn(`⚠️ [TRADING-DATA] WatchlistItem missing token - will not receive WebSocket updates:`, {
                itemId: transformedItem.id,
                symbol: transformedItem.symbol,
                exchange: transformedItem.exchange,
                instrumentId: transformedItem.instrumentId,
                warning: 'Token is required for real-time price subscriptions'
              })
            }

            console.log(`✅ [TRADING-DATA] Item ${index + 1} transformed:`, {
              id: transformedItem.id,
              symbol: transformedItem.symbol,
              instrumentId: transformedItem.instrumentId,
              hasToken: !!transformedItem.token,
              token: transformedItem.token
            })

            return transformedItem
          } catch (itemError: any) {
            console.error(`❌ [TRADING-DATA] Error transforming item ${index + 1}:`, {
              error: itemError.message,
              stack: itemError.stack,
              edge: e,
            })
            return null
          }
        })
        .filter((item: any) => item != null) // Remove any null entries from map

      console.log(`✅ [TRADING-DATA] Watchlist ${wlNode.id} transformed with ${items.length} items`)
      return { id: wlNode.id, name: wlNode.name || 'My Watchlist', items: items || [] };
    } catch (error: any) {
      console.error('❌ [TRADING-DATA] Fatal error in useUserWatchlist useMemo:', {
        error: error.message,
        stack: error.stack,
        data,
      })
      return { id: null, name: 'My Watchlist', items: [] }; // Return safe default on error
    }
  }, [data]);

  const isInitialLoading = loading && !data
  const isRefreshing = loading && !!data

  return {
    watchlist,
    isLoading: isInitialLoading,
    isRefreshing,
    isError: !!error,
    error,
    mutate: refetch,
  };
}


function useAccountId(userId?: string) {
  // Use SWR with Prisma-based API instead of GraphQL
  const { data } = useSWR<any>(
    userId ? `/api/trading/account?userId=${userId}` : null,
    async (url: string) => {
      const res = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(TRADING_DATA_FETCHER_TIMEOUT_MS),
      })
      if (!res.ok) return null
      return res.json()
    }
  )
  return data?.account?.id as string | undefined
}

export function useOrders(userId?: string, tradingAccountIdOverride?: string) {
  const tradingAccountId = tradingAccountIdOverride || useAccountId(userId)
  const { data, loading, error, refetch } = useQuery<any>(GET_ORDERS, {
    variables: { tradingAccountId: tradingAccountId ?? "" },
    skip: !tradingAccountId,
    errorPolicy: "all",
    notifyOnNetworkStatusChange: true,
  })

  const orders = useMemo(() => data?.ordersCollection?.edges?.map((e: any) => ({ ...e.node, price: e.node.price != null ? toNumber(e.node.price) : null, averagePrice: e.node.averagePrice != null ? toNumber(e.node.averagePrice) : null })) ?? [], [data])

  // Do not block UI when accountId is not yet available; treat as not loading
  const isInitialLoading = loading && !data
  const isRefreshing = loading && !!data
  return { orders, isLoading: isInitialLoading, isRefreshing, isError: !!error, error, mutate: refetch }
}

export function usePositions(userId?: string, tradingAccountIdOverride?: string) {
  const tradingAccountId = tradingAccountIdOverride || useAccountId(userId)
  const { data, loading, error, refetch } = useQuery<any>(GET_POSITIONS, {
    variables: { tradingAccountId: tradingAccountId ?? "" },
    skip: !tradingAccountId,
    errorPolicy: "all",
    notifyOnNetworkStatusChange: true,
  })

  const positions = useMemo(() => data?.positionsCollection?.edges?.map((e: any) => ({ 
    ...e.node, 
    averagePrice: toNumber(e.node.averagePrice), 
    stopLoss: e.node.stopLoss != null ? toNumber(e.node.stopLoss) : undefined, 
    target: e.node.target != null ? toNumber(e.node.target) : undefined, 
    unrealizedPnL: e.node.unrealizedPnL != null ? toNumber(e.node.unrealizedPnL) : 0,
    dayPnL: e.node.dayPnL != null ? toNumber(e.node.dayPnL) : 0,
    instrumentId: e.node.stock?.instrumentId,
    segment: e.node.stock?.segment,
    strikePrice: e.node.stock?.strikePrice != null ? toNumber(e.node.stock.strikePrice) : undefined,
    optionType: e.node.stock?.optionType,
    expiry: e.node.stock?.expiry,
    lotSize: e.node.stock?.lot_size
  })) ?? [], [data])

  // Do not block UI while accountId is unknown; only show loading when fetching
  const isInitialLoading = loading && !data
  const isRefreshing = loading && !!data
  return { positions, isLoading: isInitialLoading, isRefreshing, isError: !!error, error, mutate: refetch }
}

export function useOrdersAndPositions(userId?: string, tradingAccountIdOverride?: string) {
  // Use SWR with Prisma-based APIs instead of GraphQL
  // Fetch orders and positions separately for better performance
  const { data: ordersData, error: ordersError, isLoading: ordersLoading, mutate: mutateOrders } = useSWR<any>(
    userId ? `/api/trading/orders/list?userId=${userId}` : null,
    async (url: string) => {
      const res = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(TRADING_DATA_FETCHER_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error('Failed to fetch orders')
      return res.json()
    },
    {
      refreshInterval: 0,
      revalidateOnFocus: true,
      focusThrottleInterval: 60_000,
      revalidateOnReconnect: true,
    }
  )

  const { data: positionsData, error: positionsError, isLoading: positionsLoading, mutate: mutatePositions } = useSWR<any>(
    userId ? `/api/trading/positions/list?userId=${userId}` : null,
    async (url: string) => {
      const res = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(TRADING_DATA_FETCHER_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error('Failed to fetch positions')
      return res.json()
    },
    {
      refreshInterval: 0,
      revalidateOnFocus: true,
      focusThrottleInterval: 60_000,
      revalidateOnReconnect: true,
    }
  )

  const orders = useMemo(() => ordersData?.orders ?? [], [ordersData])
  const positions = useMemo(() => positionsData?.positions ?? [], [positionsData])

  const isLoading = (ordersLoading || positionsLoading) && (!ordersData && !positionsData)
  const isRefreshing = (ordersLoading || positionsLoading) && (!!ordersData || !!positionsData)
  const error = ordersError || positionsError

  const mutate = useMemo(() => {
    return async () => {
      await Promise.all([mutateOrders(), mutatePositions()])
    }
  }, [mutateOrders, mutatePositions])

  return {
    orders,
    positions,
    isLoading,
    isRefreshing,
    isError: !!error,
    error,
    mutate
  }
}

async function fetchTransactions(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (res.status === 403) return { transactions: [] }
  if (!res.ok) throw new Error(`transactions ${res.status}`)
  return res.json() as Promise<{ transactions: any[] }>
}

// tradingAccountId is accepted only to preserve the call-site signature.
// The real gate is whether it is truthy — when falsy (feature disabled or
// account not yet loaded) the SWR key is null and no fetch fires.
export function useTransactions(tradingAccountId?: string) {
  const { data, error, isLoading, mutate } = useSWR(
    tradingAccountId ? "/api/trading/transactions" : null,
    fetchTransactions,
    {
      revalidateOnFocus: true,
      focusThrottleInterval: 60_000,
      revalidateOnReconnect: true,
      refreshInterval: 0,
    },
  )
  const transactions = data?.transactions ?? []
  return {
    transactions,
    isLoading: isLoading && !data,
    isRefreshing: isLoading && !!data,
    isError: !!error,
    error: error ?? null,
    mutate,
  }
}

// -----------------------------
// Action Functions
// -----------------------------

export async function searchStocks(query: string) {
  try {
    const { data } = await client.query<any>({ query: SEARCH_STOCKS, variables: { query: `%${query}%` }, fetchPolicy: "network-only" })
    return data?.stockCollection?.edges?.map((e: any) => ({
      ...e.node,
      ltp: toNumber(e.node.ltp),
      change: toNumber(e.node.change),
      changePercent: toNumber(e.node.changePercent),
      strikePrice: e.node.strikePrice != null ? toNumber(e.node.strikePrice) : undefined,
      optionType: e.node.optionType,
      expiry: e.node.expiry,
      segment: e.node.segment,
      lotSize: e.node.lot_size,
    })) ?? []
  } catch (error) {
    console.error("Search error:", error)
    return []
  }
}

export async function searchEquities(query: string) {
  try {
    const { data } = await client.query<any>({ query: SEARCH_STOCKS_EQUITY, variables: { query: `%${query}%` }, fetchPolicy: "network-only" })
    return data?.stockCollection?.edges?.map((e: any) => ({
      ...e.node,
      ltp: toNumber(e.node.ltp),
      change: toNumber(e.node.change),
      changePercent: toNumber(e.node.changePercent),
      lotSize: e.node.lot_size,
    })) ?? []
  } catch (error) {
    console.error("Equity search error:", error)
    return []
  }
}

export async function searchFutures(query: string) {
  try {
    const { data } = await client.query<any>({ query: SEARCH_STOCKS_FUTURES, variables: { query: `%${query}%` }, fetchPolicy: "network-only" })
    return data?.stockCollection?.edges?.map((e: any) => ({
      ...e.node,
      ltp: toNumber(e.node.ltp),
      change: toNumber(e.node.change),
      changePercent: toNumber(e.node.changePercent),
      lotSize: e.node.lot_size,
    })) ?? []
  } catch (error) {
    console.error("Futures search error:", error)
    return []
  }
}

export async function searchOptions(query: string) {
  try {
    const { data } = await client.query<any>({ query: SEARCH_STOCKS_OPTIONS, variables: { query: `%${query}%` }, fetchPolicy: "network-only" })
    return data?.stockCollection?.edges?.map((e: any) => ({
      ...e.node,
      ltp: toNumber(e.node.ltp),
      change: toNumber(e.node.change),
      changePercent: toNumber(e.node.changePercent),
      strikePrice: e.node.strikePrice != null ? toNumber(e.node.strikePrice) : undefined,
      optionType: e.node.optionType,
      expiry: e.node.expiry,
      lotSize: e.node.lot_size,
    })) ?? []
  } catch (error) {
    console.error("Options search error:", error)
    return []
  }
}

export async function addStockToWatchlist(userId: string, stockId: string, watchlistId?: string | null) {
  let finalWatchlistId = watchlistId;
  if (!finalWatchlistId) {
    const { data: wlData } = await client.query<any>({ query: GET_USER_WATCHLIST, variables: { userId } });
    finalWatchlistId = wlData?.watchlistCollection?.edges?.[0]?.node?.id;
    if (!finalWatchlistId) {
      const { data: newWl } = await client.mutate<any>({ mutation: CREATE_WATCHLIST, variables: { userId, name: "My Watchlist" } });
      finalWatchlistId = newWl?.insertIntowatchlistCollection?.records?.[0]?.id;
    }
  }

  if (!finalWatchlistId) throw new Error("Could not find or create a watchlist.");

  await client.mutate({ mutation: ADD_WATCHLIST_ITEM, variables: { watchlistId: finalWatchlistId, stockId: stockId } });
}

export async function removeStockFromWatchlist(watchlistItemId: string) {
  await client.mutate({ mutation: REMOVE_WATCHLIST_ITEM, variables: { id: watchlistItemId } });
}


/** Margin and charge previews for orders: use server `MarginCalculator` via `/api/trading/orders` and `/api/risk/config` (see `use-order-form`); do not duplicate F&O BUY/SELL margin here. */

export async function placeOrder(orderData: {
  userId?: string
  userName?: string | null
  userEmail?: string | null
  tradingAccountId?: string
  symbol: string
  stockId?: string | null
  instrumentId?: string | null
  token?: number | null
  quantity: number
  price: number | null
  orderType: ClientOrderType
  orderSide: ClientOrderSide
  productType?: string
  exchange?: string | null
  segment?: string | null
  name?: string | null
  ltp?: number | null
  ltpTimestamp?: number | null
  ltpSource?: string | null
  ltpAgeMs?: number | null
  close?: number | null
  strikePrice?: number | null
  optionType?: string | null
  expiry?: string | null
  lotSize?: number | null
  watchlistItemId?: string | null
  /** Pre-computed spread % locked at order-sheet open time; forwarded to execution service for consistency. */
  spreadOverride?: number
  session?: any
}) {
    const logger = orderData.session ? createLoggerFromSession(orderData.session, orderData.tradingAccountId) : null
    
    try {
        await logger?.logSystemEvent("ORDER_START", `Starting order placement for ${orderData.symbol}`)
        
        // Normalize product type to backend-expected values (MIS/CNC/NRML)
        const normalizedSegment = (orderData.segment || orderData.exchange || "NSE").toUpperCase()
        const defaultProductType =
          normalizedSegment === "NFO" ||
          normalizedSegment === "FNO" ||
          normalizedSegment === "NSE_FO" ||
          normalizedSegment === "MCX" ||
          normalizedSegment === "MCX_FO"
            ? "NRML"
            : "CNC"
        const normalizedProductType = (() => {
          const pt = (orderData.productType || defaultProductType).toUpperCase()
          if (pt === "INTRADAY" || pt === "MIS") return "MIS"
          if (pt === "DELIVERY" || pt === "CNC") return "CNC"
          if (pt === "NRML") return "NRML"
          return pt || defaultProductType
        })()

        // User.id is uuid; Stock.id and WatchlistItem.id are cuid — only validate userId as UUID.
        const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
        const safeUserId = typeof orderData.userId === 'string' && UUID_RE.test(orderData.userId) ? orderData.userId : undefined
        const safeStockId =
          typeof orderData.stockId === 'string' && orderData.stockId.trim().length > 0
            ? orderData.stockId.trim()
            : undefined
        const safeWatchlistItemId =
          typeof orderData.watchlistItemId === 'string' && orderData.watchlistItemId.trim().length > 0
            ? orderData.watchlistItemId.trim()
            : undefined
        const safeOptionType = orderData.optionType === 'CE' || orderData.optionType === 'PE' ? orderData.optionType : undefined

        // Call server-side order placement API
        const response = await fetch('/api/trading/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tradingAccountId: orderData.tradingAccountId,
                userId: safeUserId,
                userName: orderData.userName,
                userEmail: orderData.userEmail,
                stockId: safeStockId,
                instrumentId: orderData.instrumentId || undefined,
                token: orderData.token ?? undefined,
                // UIR + canonical + classification — forwarded so the server doesn't lose
                // them at validation. Without these, direct (non-watchlist) orders write
                // Position rows missing identity columns the watchlist hydration would fill.
                uirId: typeof (orderData as any).uirId === "number" && (orderData as any).uirId > 0
                  ? (orderData as any).uirId
                  : undefined,
                canonicalSymbol: typeof (orderData as any).canonicalSymbol === "string" && (orderData as any).canonicalSymbol.trim().length > 0
                  ? (orderData as any).canonicalSymbol.trim()
                  : undefined,
                instrumentType: typeof (orderData as any).instrumentType === "string" && (orderData as any).instrumentType.trim().length > 0
                  ? (orderData as any).instrumentType.trim().toUpperCase()
                  : undefined,
                symbol: orderData.symbol,
                quantity: orderData.quantity,
                price: orderData.price,
                orderType: orderData.orderType,
                orderSide: orderData.orderSide,
                productType: normalizedProductType,
                segment: orderData.segment || orderData.exchange,
                exchange: orderData.exchange,
                name: orderData.name,
                ltp: orderData.ltp ?? undefined,
                ltpTimestamp: orderData.ltpTimestamp ?? undefined,
                ltpSource: orderData.ltpSource ?? undefined,
                ltpAgeMs: orderData.ltpAgeMs ?? undefined,
                close: orderData.close ?? undefined,
                strikePrice: orderData.strikePrice ?? undefined,
                optionType: safeOptionType,
                expiry: orderData.expiry ?? undefined,
                lotSize: orderData.lotSize ?? undefined,
                watchlistItemId: safeWatchlistItemId,
                spreadOverride: typeof orderData.spreadOverride === "number" && orderData.spreadOverride > 0
                  ? orderData.spreadOverride
                  : undefined,
            })
        })

        if (!response.ok) {
            const payload = await readResponseBodyJsonSafe(response)
            const message = resolveTradingApiErrorMessage(
              payload,
              response,
              "Failed to place order",
            )
            throw new Error(message)
        }

        const result = await response.json()
        
        await logger?.logSystemEvent("ORDER_PLACED", `Order ${result.orderId} placed successfully for ${orderData.symbol}`)

        // Return full backend payload so UI can respect async execution (executionScheduled)
        return {
          success: true,
          ...result
        }
    } catch (error: unknown) {
        await logger?.logError(error, "Order placement", orderData)
        console.error("Error placing order:", error)
        if (error instanceof Error && error.message.trim().length > 0) {
            throw error
        }
        throw new Error("Failed to place order.")
    }
}

export async function cancelOrder(orderId: string) {
  try {
    const response = await fetch('/api/trading/orders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId })
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to cancel order')
    }
    return await response.json()
  } catch (error) {
    console.error("Error cancelling order:", error); throw new Error("Failed to cancel order.")
  }
}
export async function modifyOrder(orderId: string, updates: { price?: number; quantity?: number }) {
  try {
    const response = await fetch('/api/trading/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, ...updates })
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to modify order')
    }
    return await response.json()
  } catch (error) {
    console.error("Error modifying order:", error); throw new Error("Failed to modify order.")
  }
}
export async function deleteOrder(orderId: string) {
  try {
    const response = await fetch('/api/trading/orders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId })
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete order')
    }
    return await response.json()
  } catch (error) {
    console.error("Error deleting order:", error); throw new Error("Failed to delete order.")
  }
}
export async function closePosition(
  positionId: string,
  session?: any,
  exitPrice?: number,
  options?: {
    closeQuantity?: number
    closeLots?: number
  },
) {
  const logger = session ? createLoggerFromSession(session) : null
  
  try {
    await logger?.logSystemEvent("POSITION_CLOSE_START", `Starting position close for ${positionId}`)
    
    const response = await fetch('/api/trading/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        positionId, 
        tradingAccountId: session?.user?.tradingAccountId,
        exitPrice,  // Pass exit price if provided
        closeQuantity: options?.closeQuantity,
        closeLots: options?.closeLots,
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to close position')
    }

    const result = await response.json()
    await logger?.logSystemEvent("POSITION_CLOSE_COMPLETE", `Position ${positionId} closed successfully`)
    
    return result
  } catch (error) {
    await logger?.logError(error as Error, "Position closure", { positionId })
    console.error("Error closing position:", error); 
    throw new Error(error instanceof Error ? error.message : "Failed to close position.")
  }
}
export async function updateStopLoss(
  positionId: string,
  stopLoss: number,
  tradingAccountId?: string,
) {
  try {
    const response = await fetch('/api/trading/positions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positionId,
        tradingAccountId,
        updates: { stopLoss },
      })
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update stop loss')
    }
    return await response.json()
  } catch (error) {
    console.error("Error updating stop loss:", error); throw new Error("Failed to update stop loss.")
  }
}
export async function updateTarget(
  positionId: string,
  target: number,
  tradingAccountId?: string,
) {
  try {
    const response = await fetch('/api/trading/positions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positionId,
        tradingAccountId,
        updates: { target },
      })
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update target')
    }
    return await response.json()
  } catch (error) {
    console.error("Error updating target:", error); throw new Error("Failed to update target.")
  }
}


interface FundTransferPayload {
  tradingAccountId: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  description: string;
}

export async function addFunds(payload: FundTransferPayload) {
  try {
    // This assumes your backend handles the balance update based on the transaction.
    // You might need a more direct mutation to update the balance on the client side.
    await client.mutate({ mutation: INSERT_TRANSACTION, variables: { object: payload } });
  } catch (error) {
    console.error("Error adding funds:", error);
    throw new Error("Failed to add funds.");
  }
}

export async function withdrawFunds(payload: FundTransferPayload) {
  try {
    await client.mutate({ mutation: INSERT_TRANSACTION, variables: { object: payload } });
  } catch (error) {
    console.error("Error withdrawing funds:", error);
    throw new Error("Failed to withdraw funds.");
  }
}
