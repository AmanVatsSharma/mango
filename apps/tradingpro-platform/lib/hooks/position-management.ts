export async function closePosition(
  positionId: string,
  tradingAccountId: string,
  options?: {
    closeQuantity?: number
    closeLots?: number
  },
) {
  try {
    const response = await fetch('/api/trading/positions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        positionId,
        tradingAccountId,
        closeQuantity: options?.closeQuantity,
        closeLots: options?.closeLots,
      }),
      // 12s timeout. Close is a user-action mutation (often clicked from a
      // panic-square-off path). A hung backend would leave the user staring
      // at a spinner with no error feedback. TimeoutError surfaces a clear
      // failure so the caller can toast and the user can retry.
      signal: AbortSignal.timeout(12_000),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to close position')
    }

    const result = await response.json()
    return result
  } catch (error) {
    console.error('Error closing position:', error)
    throw error
  }
}
