/**
 * Trading Notifications Hook
 * 
 * Provides toast notifications for trading events:
 * - Order placed
 * - Order executed
 * - Position closed
 * - Fund operations
 * - Errors
 */

"use client"

import { useCallback } from 'react'
import { toast } from '@/hooks/use-toast'

export function useTradingNotifications() {
  // Order placed notification
  const notifyOrderPlaced = useCallback((orderData: any) => {
    toast({
      title: "Order Placed Successfully",
      description: `${orderData.orderSide} ${orderData.quantity} ${orderData.symbol} @ ${orderData.orderType}`,
      duration: 3000,
    })
  }, [])

  // Order executed notification
  const notifyOrderExecuted = useCallback((orderData: any) => {
    toast({
      title: "Order Executed",
      description: `${orderData.orderSide} order for ${orderData.symbol} has been executed`,
      duration: 3000,
    })
  }, [])

  // Position closed notification
  const notifyPositionClosed = useCallback((positionData: any, pnl: number) => {
    toast({
      title: "Position Closed",
      description: `${positionData.symbol} closed with ${pnl >= 0 ? 'profit' : 'loss'} of ₹${Math.abs(pnl).toFixed(2)}`,
      duration: 3000,
      variant: pnl >= 0 ? "default" : "destructive"
    })
  }, [])

  // Fund operation notification
  const notifyFundOperation = useCallback((type: string, amount: number) => {
    const messages = {
      CREDIT: `₹${amount.toFixed(2)} credited to your account`,
      DEBIT: `₹${amount.toFixed(2)} debited from your account`,
      BLOCK: `₹${amount.toFixed(2)} margin blocked`,
      RELEASE: `₹${amount.toFixed(2)} margin released`
    }
    
    toast({
      title: "Fund Operation",
      description: messages[type as keyof typeof messages] || 'Fund operation completed',
      duration: 3000,
    })
  }, [])

  // Error notification
  const notifyError = useCallback((error: string) => {
    toast({
      title: "Error",
      description: error,
      duration: 5000,
      variant: "destructive"
    })
  }, [])

  // Success notification
  const notifySuccess = useCallback((message: string) => {
    toast({
      title: "Success",
      description: message,
      duration: 3000,
    })
  }, [])

  // Rate limit warning
  const notifyRateLimitWarning = useCallback((retryAfter?: number) => {
    toast({
      title: "Slow Down",
      description: `Too many requests. Please wait ${retryAfter || 60} seconds before trying again.`,
      duration: 5000,
      variant: "destructive"
    })
  }, [])

  return {
    notifyOrderPlaced,
    notifyOrderExecuted,
    notifyPositionClosed,
    notifyFundOperation,
    notifyError,
    notifySuccess,
    notifyRateLimitWarning
  }
}
