/**
 * @file use-console-data.ts
 * @module hooks
 * @description Console aggregate data fetch/mutations for trading console UI.
 * @author StockTrade
 * @created 2026-04-01
 * @updated 2026-04-06 — Avatar update/clear actions.
 */

import { useState, useEffect, useCallback } from 'react'
import { ConsoleData, BankAccount, Deposit, Withdrawal, UserProfile } from '../console-data-service'
import type { PublicPaymentDepositSettingsV1 } from '@/lib/payment-deposit-public'

function parseJsonSafe(text: string): unknown {
  const t = text.trim()
  if (!t) return null
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

function messageFromConsoleBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>
    const m = o.message
    if (typeof m === 'string' && m.trim()) return m.trim()
    const e = o.error
    if (typeof e === 'string' && e.trim()) return e.trim()
  }
  return fallback
}

type ConsoleActionResult = {
  success: boolean
  message: string
  depositId?: string
  withdrawalId?: string
  [key: string]: unknown
}

async function postConsoleAction(
  payload: { action: string; data?: unknown },
  logLabel: string
): Promise<ConsoleActionResult> {
  const response = await fetch('/api/console', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  const parsed = parseJsonSafe(text) as Record<string, unknown> | null

  if (!response.ok) {
    const message = messageFromConsoleBody(
      parsed,
      `Request failed (${response.status})`
    )
    console.warn(`⚠️ [USE-CONSOLE-DATA] ${logLabel} non-OK`, {
      status: response.status,
      message,
    })
    return { ...(parsed ?? {}), success: false, message } as ConsoleActionResult
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      success: false,
      message: 'Invalid response from server. Please try again.',
    }
  }

  const success = Boolean(parsed.success)
  const messageRaw = parsed.message
  const message =
    typeof messageRaw === 'string' && messageRaw.trim()
      ? messageRaw.trim()
      : success
        ? 'OK'
        : messageFromConsoleBody(parsed, 'Request failed. Please try again.')

  return { ...parsed, success, message } as ConsoleActionResult
}

export function useConsoleData(userId?: string) {
  const [consoleData, setConsoleData] = useState<ConsoleData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentSettings, setPaymentSettings] = useState<PublicPaymentDepositSettingsV1 | null>(null)
  const [paymentSettingsError, setPaymentSettingsError] = useState<string | null>(null)
  const [paymentSettingsLoading, setPaymentSettingsLoading] = useState(false)

  const fetchPaymentSettings = useCallback(async () => {
    setPaymentSettingsLoading(true)
    setPaymentSettingsError(null)
    try {
      console.log('🔄 [USE-CONSOLE-DATA] Fetching payment settings')
      const response = await fetch("/api/settings/payment", { cache: "no-store" })
      const text = await response.text()
      const json = parseJsonSafe(text) as Record<string, unknown> | null

      if (!response.ok || !json || json.success !== true) {
        throw new Error(
          messageFromConsoleBody(json, `Failed to load payment settings (${response.status})`)
        )
      }

      const payload = json?.data as PublicPaymentDepositSettingsV1 | undefined
      if (!payload || payload.version !== 1) {
        throw new Error("Invalid payment settings payload")
      }
      setPaymentSettings(payload)
      console.log("✅ [USE-CONSOLE-DATA] Payment settings v1 loaded", { order: payload.order })
    } catch (e) {
      console.warn('⚠️ [USE-CONSOLE-DATA] Failed to load payment settings', e)
      setPaymentSettings(null)
      setPaymentSettingsError(e instanceof Error ? e.message : "Failed to load payment options")
    } finally {
      setPaymentSettingsLoading(false)
    }
  }, [])

  const fetchConsoleData = useCallback(async () => {
    if (!userId) return

    setIsLoading(true)
    setError(null)

    try {
      console.log('🔄 [USE-CONSOLE-DATA] Fetching console data via API')
      const response = await fetch('/api/console', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store'
      })

      if (!response.ok) {
        console.warn('⚠️ [USE-CONSOLE-DATA] Non-OK response for console data', { status: response.status })
        const text = await response.text()
        const maybeJson = parseJsonSafe(text) as Record<string, unknown> | null
        if (maybeJson && (maybeJson.user || maybeJson._fallback)) {
          console.log('🛟 [USE-CONSOLE-DATA] Using fallback/partial console payload')
          setConsoleData(maybeJson as ConsoleData)
          await fetchPaymentSettings()
          return
        }
        throw new Error(
          messageFromConsoleBody(maybeJson, `Failed to fetch console data (${response.status})`)
        )
      }

      const data = await response.json()
      console.log('✅ [USE-CONSOLE-DATA] Console data fetched successfully')
      setConsoleData(data)
      await fetchPaymentSettings()
    } catch (err) {
      console.error('❌ [USE-CONSOLE-DATA] Error fetching console data:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch console data')
    } finally {
      setIsLoading(false)
    }
  }, [userId, fetchPaymentSettings])

  useEffect(() => {
    fetchConsoleData()
  }, [fetchConsoleData])

  const updateUserProfile = useCallback(async (profileData: Partial<UserProfile>) => {
    if (!userId) return { success: false, message: 'User ID required' }

    try {
      console.log('🔄 [USE-CONSOLE-DATA] Updating user profile via API')
      const result = await postConsoleAction(
        { action: 'updateProfile', data: profileData },
        'updateProfile'
      )

      if (result.success) {
        console.log('✅ [USE-CONSOLE-DATA] User profile updated successfully')
        await fetchConsoleData()
      } else {
        console.warn('⚠️ [USE-CONSOLE-DATA] User profile update failed', { message: result.message })
      }
      return result
    } catch (err) {
      console.error('❌ [USE-CONSOLE-DATA] Error updating profile:', err)
      return { success: false, message: err instanceof Error ? err.message : 'Failed to update profile' }
    }
  }, [userId, fetchConsoleData])

  const addBankAccount = useCallback(async (bankData: Omit<BankAccount, 'id' | 'createdAt'>) => {
    if (!userId) return { success: false, message: 'User ID required' }

    try {
      console.log('🔄 [USE-CONSOLE-DATA] Adding bank account via API')
      const result = await postConsoleAction({ action: 'addBankAccount', data: bankData }, 'addBankAccount')

      if (result.success) {
        console.log('✅ [USE-CONSOLE-DATA] Bank account added successfully')
        await fetchConsoleData()
      } else {
        console.warn('⚠️ [USE-CONSOLE-DATA] Add bank account failed', { message: result.message })
      }
      return result
    } catch (err) {
      console.error('❌ [USE-CONSOLE-DATA] Error adding bank account:', err)
      return { success: false, message: err instanceof Error ? err.message : 'Failed to add bank account' }
    }
  }, [userId, fetchConsoleData])

  const updateBankAccount = useCallback(async (accountId: string, bankData: Partial<BankAccount>) => {
    if (!userId) return { success: false, message: 'User ID required' }

    try {
      console.log('🔄 [USE-CONSOLE-DATA] Updating bank account via API')
      const result = await postConsoleAction(
        { action: 'updateBankAccount', data: { accountId, bankData } },
        'updateBankAccount'
      )

      if (result.success) {
        console.log('✅ [USE-CONSOLE-DATA] Bank account updated successfully')
        await fetchConsoleData()
      } else {
        console.warn('⚠️ [USE-CONSOLE-DATA] Update bank account failed', { message: result.message })
      }
      return result
    } catch (err) {
      console.error('❌ [USE-CONSOLE-DATA] Error updating bank account:', err)
      return { success: false, message: err instanceof Error ? err.message : 'Failed to update bank account' }
    }
  }, [userId, fetchConsoleData])

  const deleteBankAccount = useCallback(async (accountId: string) => {
    if (!userId) return { success: false, message: 'User ID required' }

    try {
      console.log('🔄 [USE-CONSOLE-DATA] Deleting bank account via API')
      const result = await postConsoleAction(
        { action: 'deleteBankAccount', data: { accountId } },
        'deleteBankAccount'
      )

      if (result.success) {
        console.log('✅ [USE-CONSOLE-DATA] Bank account deleted successfully')
        await fetchConsoleData()
      } else {
        console.warn('⚠️ [USE-CONSOLE-DATA] Delete bank account failed', { message: result.message })
      }
      return result
    } catch (err) {
      console.error('❌ [USE-CONSOLE-DATA] Error deleting bank account:', err)
      return { success: false, message: err instanceof Error ? err.message : 'Failed to delete bank account' }
    }
  }, [userId, fetchConsoleData])

  const createDepositRequest = useCallback(async (depositData: {
    amount: number
    method: string
    bankAccountId?: string
    utr?: string
    reference?: string
    remarks?: string
    screenshotUrl?: string
    screenshotKey?: string
    cryptoNetwork?: string
    cryptoTxHash?: string
    cryptoAsset?: string
    selectedUpiItemId?: string
    selectedCompanyBankAccountId?: string
    selectedCryptoWalletId?: string
  }) => {
    if (!userId) return { success: false, message: 'User ID required' }

    try {
      console.log('🔄 [USE-CONSOLE-DATA] Creating deposit request via API')
      const result = await postConsoleAction(
        { action: 'createDepositRequest', data: depositData },
        'createDepositRequest'
      )

      if (result.success) {
        console.log('✅ [USE-CONSOLE-DATA] Deposit request created successfully')
        await fetchConsoleData()
      } else {
        console.warn('⚠️ [USE-CONSOLE-DATA] Deposit request failed', { message: result.message })
      }
      return result
    } catch (err) {
      console.error('❌ [USE-CONSOLE-DATA] Error creating deposit request:', err)
      return { success: false, message: err instanceof Error ? err.message : 'Failed to create deposit request' }
    }
  }, [userId, fetchConsoleData])

  const createWithdrawalRequest = useCallback(async (withdrawalData: {
    amount: number
    bankAccountId: string
    reference?: string
    remarks?: string
    charges?: number
  }) => {
    if (!userId) return { success: false, message: 'User ID required' }

    try {
      console.log('🔄 [USE-CONSOLE-DATA] Creating withdrawal request via API')
      const result = await postConsoleAction(
        { action: 'createWithdrawalRequest', data: withdrawalData },
        'createWithdrawalRequest'
      )

      if (result.success) {
        console.log('✅ [USE-CONSOLE-DATA] Withdrawal request created successfully')
        await fetchConsoleData()
      } else {
        console.warn('⚠️ [USE-CONSOLE-DATA] Withdrawal request failed', { message: result.message })
      }
      return result
    } catch (err) {
      console.error('❌ [USE-CONSOLE-DATA] Error creating withdrawal request:', err)
      return { success: false, message: err instanceof Error ? err.message : 'Failed to create withdrawal request' }
    }
  }, [userId, fetchConsoleData])

  const updateUserAvatar = useCallback(
    async (imageUrl: string) => {
      if (!userId) return { success: false, message: 'User ID required' }
      try {
        const result = await postConsoleAction(
          { action: 'updateAvatar', data: { imageUrl } },
          'updateAvatar'
        )
        if (result.success) await fetchConsoleData()
        return result
      } catch (err) {
        console.error('❌ [USE-CONSOLE-DATA] updateUserAvatar:', err)
        return { success: false, message: err instanceof Error ? err.message : 'Failed to update avatar' }
      }
    },
    [userId, fetchConsoleData]
  )

  const clearUserAvatar = useCallback(async () => {
    if (!userId) return { success: false, message: 'User ID required', image: null as null }
    try {
      const result = await postConsoleAction({ action: 'clearAvatar', data: {} }, 'clearAvatar')
      if (result.success) await fetchConsoleData()
      return result as ConsoleActionResult & { image?: null }
    } catch (err) {
      console.error('❌ [USE-CONSOLE-DATA] clearUserAvatar:', err)
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed to remove avatar',
        image: null,
      }
    }
  }, [userId, fetchConsoleData])

  return {
    consoleData,
    isLoading,
    error,
    paymentSettings,
    paymentSettingsError,
    paymentSettingsLoading,
    refetchPaymentSettings: fetchPaymentSettings,
    refetch: fetchConsoleData,
    updateUserProfile,
    updateUserAvatar,
    clearUserAvatar,
    addBankAccount,
    updateBankAccount,
    deleteBankAccount,
    createDepositRequest,
    createWithdrawalRequest
  }
}
