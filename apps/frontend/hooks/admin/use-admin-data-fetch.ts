/**
 * @file use-admin-data-fetch.ts
 * @module hooks/admin
 * @description Enhanced data fetching hook combining best features from all admin console components
 * @author StockTrade
 * @created 2025-01-27
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import { toast } from "@/hooks/use-toast"

interface UseAdminDataFetchOptions<T> {
  endpoint: string
  params?: Record<string, string | number | boolean>
  mockData?: T[]
  autoRefresh?: number // milliseconds
  onSuccess?: (data: T[]) => void
  onError?: (error: Error) => void
  transform?: (data: any) => T[]
  enabled?: boolean
}

interface UseAdminDataFetchResult<T> {
  data: T[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  isUsingMockData: boolean
  hasRealData: boolean
}

/**
 * Enhanced Admin Data Fetch Hook
 * 
 * Combines data fetching patterns from:
 * - user-management.tsx (fetchRealData)
 * - fund-management.tsx (fetchRealData)
 * - dashboard.tsx (fetchRealData)
 * - orders-management.tsx (fetchData)
 * - positions-management.tsx (fetchData)
 * - trade-management.tsx (fetchData)
 * - audit-trail.tsx (fetchAuditLogs)
 * - risk-management.tsx (fetchRiskData)
 * - system-health.tsx (fetchHealthData)
 * - financial-reports.tsx (fetchReports)
 * - advanced-analytics.tsx (fetchAnalytics)
 * 
 * Features:
 * - Standardized data fetching
 * - Loading state management
 * - Error handling with toast notifications
 * - Mock data fallback
 * - Auto-refresh support
 * - URL parameter building
 * - Transform function support
 */
export function useAdminDataFetch<T = any>({
  endpoint,
  params = {},
  mockData = [],
  autoRefresh,
  onSuccess,
  onError,
  transform,
  enabled = true
}: UseAdminDataFetchOptions<T>): UseAdminDataFetchResult<T> {
  const [data, setData] = useState<T[]>(mockData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUsingMockData, setIsUsingMockData] = useState(mockData.length > 0)

  const queryString = useMemo(() => {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, String(value))
      }
    })
    return searchParams.toString()
  }, [params])

  const fetchData = useCallback(async () => {
    if (!enabled) return

    setLoading(true)
    setError(null)

    try {
      const url = queryString ? `${endpoint}?${queryString}` : endpoint
      console.log(`🔄 [useAdminDataFetch] Fetching: ${url}`)

      const response = await fetch(url).catch((e) => {
        console.error(`❌ [useAdminDataFetch] Fetch failed:`, e)
        return null
      })

      if (response && response.ok) {
        const responseData = await response.json()
        
        // Support different response formats
        let extractedData: any[] = []
        if (Array.isArray(responseData)) {
          extractedData = responseData
        } else if (responseData.data && Array.isArray(responseData.data)) {
          extractedData = responseData.data
        } else if (responseData.success && Array.isArray(responseData.data)) {
          extractedData = responseData.data
        } else if (responseData.users) {
          extractedData = responseData.users
        } else if (responseData.deposits) {
          extractedData = responseData.deposits
        } else if (responseData.withdrawals) {
          extractedData = responseData.withdrawals
        } else if (responseData.orders) {
          extractedData = responseData.orders
        } else if (responseData.positions) {
          extractedData = responseData.positions
        } else if (responseData.transactions) {
          extractedData = responseData.transactions
        } else if (responseData.logs) {
          extractedData = responseData.logs
        } else if (responseData.limits) {
          extractedData = responseData.limits
        } else if (responseData.alerts) {
          extractedData = responseData.alerts
        } else if (responseData.configs) {
          extractedData = responseData.configs
        } else if (responseData.reports) {
          extractedData = responseData.reports
        } else if (responseData.metrics) {
          extractedData = responseData.metrics
        } else if (responseData.services) {
          extractedData = responseData.services
        } else if (responseData.records) {
          extractedData = responseData.records
        }

        // Apply transform if provided
        const finalData = transform ? transform(extractedData) : extractedData

        setData(finalData)
        setIsUsingMockData(false)
        setError(null)

        console.log(`✅ [useAdminDataFetch] Loaded ${finalData.length} items`)

        if (onSuccess) {
          onSuccess(finalData)
        }
      } else {
        // Use mock data if available
        if (mockData.length > 0) {
          setData(mockData)
          setIsUsingMockData(true)
          console.warn(`⚠️ [useAdminDataFetch] Using mock data for ${endpoint}`)
        } else {
          setData([])
          setIsUsingMockData(false)
          const errorMsg = `Failed to fetch: ${response?.status || 'Network error'}`
          setError(errorMsg)
          throw new Error(errorMsg)
        }
      }
    } catch (err: any) {
      console.error(`❌ [useAdminDataFetch] Error:`, err)
      const errorMessage = err.message || "Failed to load data"
      setError(errorMessage)
      
      // Fallback to mock data if available
      if (mockData.length > 0) {
        setData(mockData)
        setIsUsingMockData(true)
      } else {
        setData([])
        setIsUsingMockData(false)
      }

      if (onError) {
        onError(err)
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        })
      }
    } finally {
      setLoading(false)
    }
  }, [endpoint, queryString, mockData, transform, enabled, onSuccess, onError])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh && autoRefresh > 0) {
      const interval = setInterval(fetchData, autoRefresh)
      return () => clearInterval(interval)
    }
  }, [autoRefresh, fetchData])

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    isUsingMockData,
    hasRealData: !isUsingMockData && data.length > 0
  }
}
