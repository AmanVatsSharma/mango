/**
 * @file app/api/console/route.ts
 * @module api-console
 * @description Console aggregate GET and POST actions (profile, banks, deposits, avatar).
 * @author StockTrade
 * @created 2026-04-01
 * @updated 2026-04-06 — updateAvatar / clearAvatar actions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ConsoleDataService } from '@/lib/console-data-service'

/** Consistent error envelope for POST /api/console so clients can always toast `message`. */
function consolePostError(
  status: number,
  message: string,
  code?: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      success: false as const,
      message,
      ...(code ? { code } : {}),
      ...extra,
    },
    { status }
  )
}

// Provide a minimal fallback payload so UI can render even if DB fails
function buildFallbackConsoleData(userId: string) {
  const nowIso = new Date().toISOString()
  return {
    user: {
      id: userId,
      role: 'USER',
      isActive: true,
      createdAt: nowIso,
      kycStatus: 'PENDING'
    },
    tradingAccount: {
      id: '',
      balance: 0,
      availableMargin: 0,
      usedMargin: 0,
      createdAt: nowIso
    },
    bankAccounts: [],
    deposits: [],
    withdrawals: [],
    transactions: [],
    positions: [],
    orders: [],
    userProfile: undefined,
    summary: {
      totalDeposits: 0,
      totalWithdrawals: 0,
      pendingDeposits: 0,
      pendingWithdrawals: 0,
      totalBankAccounts: 0
    },
    _fallback: true
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  console.log('📥 [CONSOLE-API] GET request received')
  
  try {
    // Step 1: Authenticate
    const session = await auth()
    console.log('🔐 [CONSOLE-API] Session check:', { 
      hasSession: !!session, 
      userId: session?.user?.id,
      elapsed: `${Date.now() - startTime}ms`
    })

    if (!session?.user?.id) {
      console.warn('⚠️ [CONSOLE-API] Unauthorized access attempt')
      return NextResponse.json(
        { 
          error: 'Unauthorized', 
          message: 'Please sign in to access your console' 
        }, 
        { status: 401 }
      )
    }

    // Step 2: Fetch console data with graceful fallback
    console.log('📊 [CONSOLE-API] Fetching console data for user:', session.user.id)
    const consoleData = await ConsoleDataService.getConsoleData(session.user.id)

    if (!consoleData) {
      console.warn('⚠️ [CONSOLE-API] Console data service returned null - serving fallback payload')
      const fallback = buildFallbackConsoleData(session.user.id)
      return NextResponse.json(fallback, { 
        status: 200,
        headers: {
          'x-console-fallback': '1',
          'x-console-fallback-reason': 'service_null',
          'x-console-user-id': session.user.id
        }
      })
    }

    // Step 3: Return success
    const elapsed = Date.now() - startTime
    console.log('✅ [CONSOLE-API] Console data fetched successfully', { 
      userId: session.user.id,
      elapsed: `${elapsed}ms`,
      dataKeys: Object.keys(consoleData)
    })
    
    return NextResponse.json(consoleData)
    
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error('❌ [CONSOLE-API] Error in console GET:', error)
    console.error('🔍 [CONSOLE-API] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : 'Unknown',
      elapsed: `${elapsed}ms`
    })
    
    try {
      // Last-resort fallback to avoid breaking the console UI
      const session = await auth()
      if (session?.user?.id) {
        console.warn('🛟 [CONSOLE-API] Serving fallback console payload from catch')
        const fallback = buildFallbackConsoleData(session.user.id)
        return NextResponse.json(fallback, { 
          status: 200,
          headers: {
            'x-console-fallback': '1',
            'x-console-fallback-reason': 'exception',
            'x-console-user-id': session.user.id
          }
        })
      }
    } catch {
      // ignore and proceed to error response
    }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  console.log('📥 [CONSOLE-API] POST request received')
  
  try {
    // Step 1: Authenticate
    const session = await auth()
    console.log('🔐 [CONSOLE-API] Session check:', { 
      hasSession: !!session, 
      userId: session?.user?.id 
    })

    if (!session?.user?.id) {
      console.warn('⚠️ [CONSOLE-API] Unauthorized access attempt')
      return consolePostError(401, 'Please sign in to perform this action', 'UNAUTHORIZED', {
        error: 'Unauthorized',
      })
    }

    // Step 2: Parse request body
    let body
    try {
      body = await request.json()
    } catch (parseError) {
      console.error('❌ [CONSOLE-API] Failed to parse request body:', parseError)
      return consolePostError(400, 'Request body must be valid JSON', 'INVALID_JSON', {
        error: 'Invalid request',
      })
    }

    const { action, data } = body

    if (!action) {
      console.warn('⚠️ [CONSOLE-API] Missing action in request')
      return consolePostError(400, 'Action is required', 'MISSING_ACTION', {
        error: 'Invalid request',
      })
    }

    console.log('🎯 [CONSOLE-API] Action requested:', action)
    console.log('📋 [CONSOLE-API] Action data:', data)

    // Step 3: Execute action
    let result

    try {
      switch (action) {
        case 'updateProfile':
          console.log('📝 [CONSOLE-API] Updating user profile')
          result = await ConsoleDataService.updateUserProfile(session.user.id, data)
          break
        case 'updateAvatar': {
          console.log('🖼️ [CONSOLE-API] Updating user avatar')
          const imageUrl = typeof data?.imageUrl === 'string' ? data.imageUrl : ''
          result = await ConsoleDataService.updateUserAvatar(session.user.id, imageUrl)
          break
        }
        case 'clearAvatar':
          console.log('🖼️ [CONSOLE-API] Clearing user avatar')
          result = await ConsoleDataService.clearUserAvatar(session.user.id)
          break
        case 'addBankAccount':
          console.log('🏦 [CONSOLE-API] Adding bank account')
          result = await ConsoleDataService.addBankAccount(session.user.id, data)
          break
        case 'updateBankAccount':
          console.log('🏦 [CONSOLE-API] Updating bank account')
          result = await ConsoleDataService.updateBankAccount(session.user.id, data.accountId, data.bankData)
          break
        case 'deleteBankAccount':
          console.log('🗑️ [CONSOLE-API] Deleting bank account')
          result = await ConsoleDataService.deleteBankAccount(session.user.id, data.accountId)
          break
        case 'createDepositRequest':
          console.log('💰 [CONSOLE-API] Creating deposit request')
          result = await ConsoleDataService.createDepositRequest(session.user.id, data)
          break
        case 'createWithdrawalRequest':
          console.log('💸 [CONSOLE-API] Creating withdrawal request')
          result = await ConsoleDataService.createWithdrawalRequest(session.user.id, data)
          break
        default:
          console.warn('⚠️ [CONSOLE-API] Invalid action:', action)
          return consolePostError(400, `Action '${action}' is not supported`, 'INVALID_ACTION', {
            error: 'Invalid action',
          })
      }
    } catch (actionError) {
      console.error(`❌ [CONSOLE-API] Error executing action '${action}':`, actionError)
      return consolePostError(
        500,
        actionError instanceof Error ? actionError.message : 'Failed to execute action',
        'ACTION_FAILED',
        { error: 'Action failed' }
      )
    }

    // Step 4: Return result
    const elapsed = Date.now() - startTime
    console.log('✅ [CONSOLE-API] Action completed:', { 
      action, 
      success: result.success,
      elapsed: `${elapsed}ms`
    })
    
    return NextResponse.json(result)
    
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error('❌ [CONSOLE-API] Error in console POST:', error)
    console.error('🔍 [CONSOLE-API] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : 'Unknown',
      elapsed: `${elapsed}ms`
    })
    
    return consolePostError(
      500,
      error instanceof Error ? error.message : 'An unexpected error occurred',
      'INTERNAL',
      {
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
      }
    )
  }
}