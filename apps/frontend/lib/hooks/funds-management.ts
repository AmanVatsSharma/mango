// Client-side funds helpers. All sensitive mutations go via server API.

/**
 * Calculates the required margin for a position
 */
export function calculateMarginRequired(price: number, quantity: number, segment: string, orderType: string = 'CNC') {
  const baseValue = quantity * price

  if (segment === 'NSE') {
    return orderType === 'MIS' ? baseValue / 200 : baseValue / 50 // 200x leverage for MIS, 50x for CNC
  }

  if (segment === 'NFO') {
    return baseValue / 100 // 100x leverage for F&O
  }

  return baseValue // Full margin for others
}

// 12s timeout for the two write paths below. These are user-action mutations
// (fund block/release, position update). A hung backend would leave the
// caller's awaiting promise pending, which surfaces as a stuck Submit button
// and confused users. Fail visibly via TimeoutError so the caller can toast
// the error and re-enable the button.
const FUNDS_MUTATION_TIMEOUT_MS = 12_000

/**
 * Server-side function to manage funds for a position
 */
export async function manageFundsForPosition(
  tradingAccountId: string,
  amount: number,
  action: 'BLOCK' | 'RELEASE'
) {
  try {
    const response = await fetch('/api/trading/funds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tradingAccountId,
        amount,
        type: action
      }),
      signal: AbortSignal.timeout(FUNDS_MUTATION_TIMEOUT_MS),
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

/**
 * Updates position and manages associated funds via server API
 */
export async function updatePositionWithFunds(
  positionId: string,
  tradingAccountId: string,
  updates: any,
  shouldReleaseMargin: boolean = false
) {
  try {
    const res = await fetch('/api/trading/positions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionId, tradingAccountId, updates, shouldReleaseMargin }),
      signal: AbortSignal.timeout(FUNDS_MUTATION_TIMEOUT_MS),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || 'Failed to update position')
    }
    return true
  } catch (error) {
    console.error('Position update error:', error)
    throw error
  }
}
