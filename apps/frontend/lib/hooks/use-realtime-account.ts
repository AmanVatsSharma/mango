/**
 * File:        lib/hooks/use-realtime-account.ts
 * Module:      Trading · Realtime Hooks
 * Purpose:     SSE-driven trading-account feed (balance / margin) — patches cache from SSE; refetch only on (re)connect or focus.
 *
 * Exports:
 *   - useRealtimeAccount(userId, activeAccountId?) → { account, isLoading, error, refresh, optimisticUpdateBalance, optimisticBlockMargin, optimisticReleaseMargin, mutate, retryCount }
 *
 * Depends on:
 *   - swr — initial fetch + cache; refreshInterval is 0
 *   - ./use-shared-sse — single shared EventSource per user
 *   - @/lib/hooks/realtime-account-number-utils — payload coercion
 *
 * Side-effects:
 *   - HTTP GET /api/trading/account on mount, on tab focus, and on network reconnect
 *
 * Key invariants:
 *   - SSE balance_updated/margin_blocked/margin_released payloads are authoritative — patch in place, do NOT refetch per event
 *   - On SSE (re)connect, TradingRealtimeProvider issues a coalesced refresh — no duplicate refetch here
 *   - No periodic safety-net polling — drift is bounded by SSE delivery + revalidateOnFocus/Reconnect
 *   - When activeAccountId is provided, fetches that specific account (for LIVE/DEMO switching)
 *
 * Read order:
 *   1. useRealtimeAccount — SWR init + SSE wiring
 *   2. SSE handler — patches cache for balance/margin events
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-15
 */

"use client"

import useSWR from 'swr'
import { useCallback, useEffect, useRef } from 'react'
import { useSharedSSESubscribe } from './use-shared-sse'
import { normalizeRealtimeAccountPatchValue } from "@/lib/hooks/realtime-account-number-utils"

// Types
interface TradingAccount {
  id: string
  userId: string
  balance: number
  availableMargin: number
  usedMargin: number
  clientId: string
  createdAt: string
  updatedAt: string
}

interface AccountResponse {
  success: boolean
  account: TradingAccount | null
  error?: string
}

interface UseRealtimeAccountReturn {
  account: TradingAccount | null
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<any>
  optimisticUpdateBalance: (balanceChange: number, marginChange: number) => void
  optimisticBlockMargin: (amount: number) => void
  optimisticReleaseMargin: (amount: number) => void
  mutate: any
  retryCount: number
}

// 15-second hard timeout. Without it, a hung backend leaves SWR's
// in-flight promise pending forever — the user sees stale data with no
// error feedback, and SWR's retry/refresh logic never fires for the dead
// request. See same constant in use-realtime-orders / use-realtime-positions.
const FETCHER_TIMEOUT_MS = 15_000

// Enhanced fetcher with better error handling
const fetcher = async (url: string): Promise<AccountResponse> => {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(FETCHER_TIMEOUT_MS),
    })
    
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Unauthorized: Please login again')
      } else if (res.status === 403) {
        throw new Error('Forbidden: Access denied')
      } else if (res.status === 404) {
        throw new Error('Account endpoint not found')
      } else if (res.status >= 500) {
        throw new Error('Server error: Please try again later')
      }
      throw new Error(`Failed to fetch account: ${res.status} ${res.statusText}`)
    }
    
    const data = await res.json()
    
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response format')
    }
    
    if (data.success === false && data.error) {
      throw new Error(data.error)
    }
    
    return data
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ [REALTIME-ACCOUNT] Fetch error:', {
        message: error.message,
        url,
        timestamp: new Date().toISOString()
      })
    }
    throw error
  }
}

// Validation helpers
function isValidNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value)
}

function validateAmount(amount: number, context: string): boolean {
  if (!isValidNumber(amount)) {
    console.error(`❌ [REALTIME-ACCOUNT] Invalid ${context} amount:`, amount, 'Type:', typeof amount)
    return false
  }
  
  if (amount < 0) {
    console.warn(`⚠️ [REALTIME-ACCOUNT] Negative ${context} amount:`, amount)
    // Allow negative amounts for debits, but log warning
  }
  
  if (Math.abs(amount) > Number.MAX_SAFE_INTEGER) {
    console.error(`❌ [REALTIME-ACCOUNT] ${context} amount too large:`, amount)
    return false
  }
  
  return true
}

function validateAccount(account: any): account is TradingAccount {
  if (!account || typeof account !== 'object') {
    return false
  }
  
  if (!account.id || typeof account.id !== 'string') {
    console.warn('⚠️ [REALTIME-ACCOUNT] Invalid account ID')
    return false
  }
  
  if (!isValidNumber(account.balance)) {
    console.warn('⚠️ [REALTIME-ACCOUNT] Invalid balance:', account.balance)
    return false
  }
  
  if (!isValidNumber(account.availableMargin)) {
    console.warn('⚠️ [REALTIME-ACCOUNT] Invalid availableMargin:', account.availableMargin)
    return false
  }
  
  if (!isValidNumber(account.usedMargin)) {
    console.warn('⚠️ [REALTIME-ACCOUNT] Invalid usedMargin:', account.usedMargin)
    return false
  }
  
  return true
}

export function useRealtimeAccount(userId: string | undefined | null, activeAccountId?: string | null): UseRealtimeAccountReturn {
  const retryCountRef = useRef(0)
  const maxRetries = 3
  const lastSyncRef = useRef<number>(Date.now())

  const DEBUG = process.env.NEXT_PUBLIC_DEBUG_REALTIME === 'true' || process.env.NODE_ENV === 'development'

  // Build fetch URL: prefer activeAccountId (for LIVE/DEMO switching) over userId
  const fetchUrl = (() => {
    if (!userId) return null
    if (activeAccountId) {
      return `/api/trading/account?userId=${userId}&accountId=${activeAccountId}`
    }
    return `/api/trading/account?userId=${userId}`
  })()

  // Initial data fetch - polling handled by adaptive useEffect below
  const { data, error, isLoading, mutate } = useSWR<AccountResponse>(
    fetchUrl,
    fetcher,
    {
      refreshInterval: 0, // Disabled - we use adaptive manual polling instead
      revalidateOnFocus: true,
      focusThrottleInterval: 60_000,
      revalidateOnReconnect: true,
      dedupingInterval: 1000,
      shouldRetryOnError: true,
      errorRetryCount: maxRetries,
      errorRetryInterval: 5000,
      onError: (err) => {
        retryCountRef.current += 1
        console.error(`❌ [REALTIME-ACCOUNT] Error (attempt ${retryCountRef.current}/${maxRetries}):`, err.message)
      },
      onSuccess: () => {
        if (retryCountRef.current > 0) {
          if (DEBUG) console.info('✅ [REALTIME-ACCOUNT] Recovered from error')
          retryCountRef.current = 0
        }
        lastSyncRef.current = Date.now()
      }
    }
  )

  // Shared SSE connection for real-time updates
  useSharedSSESubscribe(userId, useCallback((message) => {
    // Handle account-related events
    if (message.event === 'balance_updated' || 
        message.event === 'margin_blocked' || 
        message.event === 'margin_released') {
      if (DEBUG) console.debug(`📨 [REALTIME-ACCOUNT] SSE ${message.event} → patch+revalidate`)

      try {
        mutate((currentData: AccountResponse | undefined) => {
          if (!currentData || !currentData.account) return currentData
          const d: any = message.data || {}
          const next = {
            ...currentData.account,
            balance: normalizeRealtimeAccountPatchValue(d.balance, currentData.account.balance),
            availableMargin: normalizeRealtimeAccountPatchValue(
              d.availableMargin,
              currentData.account.availableMargin,
            ),
            usedMargin: normalizeRealtimeAccountPatchValue(d.usedMargin, currentData.account.usedMargin),
          }
          return { ...currentData, account: next }
        }, false)
      } catch (e) {
        console.error('❌ [REALTIME-ACCOUNT] Cache patch failed:', e)
      }

      // Trust the SSE patch — no per-event refetch. Drift recovery: SSE `connected` + revalidateOnFocus/Reconnect.
      lastSyncRef.current = Date.now()
    }
  }, [mutate, DEBUG]))

  // Refresh function
  const refresh = useCallback(async () => {
    if (DEBUG) console.info("🔄 [REALTIME-ACCOUNT] Manual refresh triggered")
    try {
      return await mutate()
    } catch (error) {
      console.error("❌ [REALTIME-ACCOUNT] Manual refresh failed:", error)
      throw error
    }
  }, [mutate])

  // Optimistic update for balance change with validation
  const optimisticUpdateBalance = useCallback((
    balanceChange: number,
    marginChange: number
  ) => {
    if (!validateAmount(balanceChange, 'balance change')) {
      console.error('❌ [REALTIME-ACCOUNT] Cannot update balance: Invalid balance change')
      return
    }
    
    if (!validateAmount(marginChange, 'margin change')) {
      console.error('❌ [REALTIME-ACCOUNT] Cannot update balance: Invalid margin change')
      return
    }
    
    if (DEBUG) console.log("⚡ [REALTIME-ACCOUNT] Optimistic update:", { balanceChange, marginChange })
    
    try {
      mutate(
        (currentData: AccountResponse | undefined) => {
          if (!currentData || !currentData.account) {
            console.warn('⚠️ [REALTIME-ACCOUNT] No account data for optimistic update')
            return currentData
          }
          
          if (!validateAccount(currentData.account)) {
            console.error('❌ [REALTIME-ACCOUNT] Invalid account data')
            return currentData
          }
          
          const newBalance = currentData.account.balance + balanceChange
          const newAvailableMargin = currentData.account.availableMargin + marginChange
          
          // Prevent negative balance (optional - uncomment if needed)
          // if (newBalance < 0) {
          //   console.error('❌ [REALTIME-ACCOUNT] Operation would result in negative balance')
          //   return currentData
          // }
          
          if (DEBUG) console.log(`💰 [REALTIME-ACCOUNT] Balance: ${currentData.account.balance} → ${newBalance}`)
          if (DEBUG) console.log(`📊 [REALTIME-ACCOUNT] Available Margin: ${currentData.account.availableMargin} → ${newAvailableMargin}`)
          
          return {
            ...currentData,
            account: {
              ...currentData.account,
              balance: newBalance,
              availableMargin: newAvailableMargin
            }
          }
        },
        false
      )
      
      // Revalidate after delay
      setTimeout(() => {
        mutate().catch(err => {
          console.error('❌ [REALTIME-ACCOUNT] Delayed revalidation failed:', err)
        })
      }, 500)
    } catch (error) {
      console.error('❌ [REALTIME-ACCOUNT] Optimistic balance update failed:', error)
    }
  }, [mutate])

  // Optimistic margin block with validation
  const optimisticBlockMargin = useCallback((amount: number) => {
    if (!validateAmount(amount, 'margin block')) {
      console.error('❌ [REALTIME-ACCOUNT] Cannot block margin: Invalid amount')
      return
    }
    
    if (amount <= 0) {
      console.error('❌ [REALTIME-ACCOUNT] Cannot block margin: Amount must be positive')
      return
    }
    
    if (DEBUG) console.log("⚡ [REALTIME-ACCOUNT] Optimistic block margin:", amount)
    
    try {
      mutate(
        (currentData: AccountResponse | undefined) => {
          if (!currentData || !currentData.account) {
            console.warn('⚠️ [REALTIME-ACCOUNT] No account data for margin block')
            return currentData
          }
          
          if (!validateAccount(currentData.account)) {
            console.error('❌ [REALTIME-ACCOUNT] Invalid account data')
            return currentData
          }
          
          const newAvailableMargin = currentData.account.availableMargin - amount
          const newUsedMargin = currentData.account.usedMargin + amount
          
          // Check if sufficient margin available
          if (newAvailableMargin < 0) {
            console.warn('⚠️ [REALTIME-ACCOUNT] Insufficient margin - operation may fail')
          }
          
          if (DEBUG) console.log(`🔒 [REALTIME-ACCOUNT] Blocking margin ${amount}`)
          if (DEBUG) console.log(`📊 [REALTIME-ACCOUNT] Available: ${currentData.account.availableMargin} → ${newAvailableMargin}`)
          if (DEBUG) console.log(`📊 [REALTIME-ACCOUNT] Used: ${currentData.account.usedMargin} → ${newUsedMargin}`)
          
          return {
            ...currentData,
            account: {
              ...currentData.account,
              availableMargin: newAvailableMargin,
              usedMargin: newUsedMargin
            }
          }
        },
        false
      )
      
      setTimeout(() => {
        mutate().catch(err => {
          console.error('❌ [REALTIME-ACCOUNT] Delayed revalidation failed:', err)
        })
      }, 500)
    } catch (error) {
      console.error('❌ [REALTIME-ACCOUNT] Optimistic margin block failed:', error)
    }
  }, [mutate])

  // Optimistic margin release with validation
  const optimisticReleaseMargin = useCallback((amount: number) => {
    if (!validateAmount(amount, 'margin release')) {
      console.error('❌ [REALTIME-ACCOUNT] Cannot release margin: Invalid amount')
      return
    }
    
    if (amount <= 0) {
      console.error('❌ [REALTIME-ACCOUNT] Cannot release margin: Amount must be positive')
      return
    }
    
    if (DEBUG) console.log("⚡ [REALTIME-ACCOUNT] Optimistic release margin:", amount)
    
    try {
      mutate(
        (currentData: AccountResponse | undefined) => {
          if (!currentData || !currentData.account) {
            console.warn('⚠️ [REALTIME-ACCOUNT] No account data for margin release')
            return currentData
          }
          
          if (!validateAccount(currentData.account)) {
            console.error('❌ [REALTIME-ACCOUNT] Invalid account data')
            return currentData
          }
          
          const newAvailableMargin = currentData.account.availableMargin + amount
          const newUsedMargin = Math.max(0, currentData.account.usedMargin - amount)
          
          console.log(`🔓 [REALTIME-ACCOUNT] Releasing margin ${amount}`)
          console.log(`📊 [REALTIME-ACCOUNT] Available: ${currentData.account.availableMargin} → ${newAvailableMargin}`)
          console.log(`📊 [REALTIME-ACCOUNT] Used: ${currentData.account.usedMargin} → ${newUsedMargin}`)
          
          return {
            ...currentData,
            account: {
              ...currentData.account,
              availableMargin: newAvailableMargin,
              usedMargin: newUsedMargin
            }
          }
        },
        false
      )
      
      setTimeout(() => {
        mutate().catch(err => {
          console.error('❌ [REALTIME-ACCOUNT] Delayed revalidation failed:', err)
        })
      }, 500)
    } catch (error) {
      console.error('❌ [REALTIME-ACCOUNT] Optimistic margin release failed:', error)
    }
  }, [mutate])

  // Safe data extraction with fallback
  const account: TradingAccount | null = (() => {
    try {
      if (data?.account && validateAccount(data.account)) {
        return data.account
      }
      return null
    } catch (err) {
      console.error('❌ [REALTIME-ACCOUNT] Error extracting account:', err)
      return null
    }
  })()

  return {
    account,
    isLoading,
    error: error || null,
    refresh,
    optimisticUpdateBalance,
    optimisticBlockMargin,
    optimisticReleaseMargin,
    mutate,
    retryCount: retryCountRef.current
  }
}
