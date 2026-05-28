/**
 * File: lib/services/notifications/NotificationService.ts
 * Module: notifications
 * Purpose: Service for creating user notifications programmatically
 * Author: BharatERP
 * Last-updated: 2025-01-27
 * Notes:
 * - Centralized notification creation
 * - Supports all notification types and priorities
 * - Auto-expires notifications after 30 days if not specified
 */

import { prisma } from "@/lib/prisma"

export type NotificationType = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS'
export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type NotificationTarget = 'ALL' | 'USERS' | 'ADMINS' | 'SPECIFIC'

export interface CreateNotificationInput {
  title: string
  message: string
  type?: NotificationType
  priority?: NotificationPriority
  target?: NotificationTarget
  targetUserIds?: string[]
  expiresAt?: Date | null
  createdBy?: string
}

/**
 * Notification Service
 * Handles creation of notifications for various events
 */
export class NotificationService {
  /**
   * Create a notification and dispatch an Expo push to any registered mobile devices
   * for SPECIFIC-target notifications (i.e. those aimed at a single user).
   */
  static async createNotification(input: CreateNotificationInput) {
    console.log("🔔 [NOTIFICATION-SERVICE] Creating notification:", {
      title: input.title,
      type: input.type,
      priority: input.priority,
      target: input.target
    })

    try {
      const notification = await prisma.notification.create({
        data: {
          title: input.title,
          message: input.message,
          type: input.type || 'INFO',
          priority: input.priority || 'MEDIUM',
          target: input.target || 'USERS',
          targetUserIds: input.targetUserIds || [],
          expiresAt: input.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
          createdBy: input.createdBy || null,
          readBy: []
        }
      })

      console.log(`✅ [NOTIFICATION-SERVICE] Notification created: ${notification.id}`)

      // Fire-and-forget Expo push for single-user notifications.
      if (
        input.target === 'SPECIFIC' &&
        input.targetUserIds &&
        input.targetUserIds.length === 1
      ) {
        const { dispatchExpoPush } = await import("./expo-push")
        dispatchExpoPush(input.targetUserIds[0], {
          title: input.title,
          body: input.message,
          data: { notificationId: notification.id },
        }).catch(() => {
          // Best-effort — failure already logged inside dispatchExpoPush.
        })
      }

      return notification
    } catch (error: any) {
      console.error("❌ [NOTIFICATION-SERVICE] Failed to create notification:", error)
      throw error
    }
  }

  /**
   * Create order-related notification
   */
  static async notifyOrderPlaced(userId: string, orderData: {
    symbol: string
    quantity: number
    orderSide: string
    orderType: string
  }) {
    return this.createNotification({
      title: "Order Placed Successfully",
      message: `${orderData.orderSide} ${orderData.quantity} ${orderData.symbol} @ ${orderData.orderType}`,
      type: 'SUCCESS',
      priority: 'MEDIUM',
      target: 'SPECIFIC',
      targetUserIds: [userId]
    })
  }

  /**
   * Create order executed notification
   */
  static async notifyOrderExecuted(userId: string, orderData: {
    symbol: string
    quantity: number
    orderSide: string
    averagePrice?: number
  }) {
    const priceText = orderData.averagePrice 
      ? ` at ₹${orderData.averagePrice.toFixed(2)}`
      : ''
    
    return this.createNotification({
      title: "Order Executed",
      message: `${orderData.orderSide} order for ${orderData.quantity} ${orderData.symbol}${priceText} has been executed`,
      type: 'SUCCESS',
      priority: 'HIGH',
      target: 'SPECIFIC',
      targetUserIds: [userId]
    })
  }

  /**
   * Create order cancelled notification
   */
  static async notifyOrderCancelled(userId: string, orderData: {
    symbol: string
    quantity: number
  }) {
    return this.createNotification({
      title: "Order Cancelled",
      message: `Your order for ${orderData.quantity} ${orderData.symbol} has been cancelled`,
      type: 'INFO',
      priority: 'MEDIUM',
      target: 'SPECIFIC',
      targetUserIds: [userId]
    })
  }

  /**
   * Create deposit notification
   */
  static async notifyDeposit(userId: string, status: 'PENDING' | 'APPROVED' | 'REJECTED', amount: number, reason?: string) {
    const messages = {
      PENDING: `Your deposit request of ₹${amount.toFixed(2)} is pending approval`,
      APPROVED: `₹${amount.toFixed(2)} has been credited to your account`,
      REJECTED: `Your deposit request of ₹${amount.toFixed(2)} was rejected${reason ? `: ${reason}` : ''}`
    }

    return this.createNotification({
      title: status === 'APPROVED' ? 'Deposit Approved' : status === 'REJECTED' ? 'Deposit Rejected' : 'Deposit Pending',
      message: messages[status],
      type: status === 'APPROVED' ? 'SUCCESS' : status === 'REJECTED' ? 'ERROR' : 'INFO',
      priority: status === 'APPROVED' ? 'HIGH' : 'MEDIUM',
      target: 'SPECIFIC',
      targetUserIds: [userId]
    })
  }

  /**
   * Create withdrawal notification
   */
  static async notifyWithdrawal(userId: string, status: 'PENDING' | 'APPROVED' | 'REJECTED', amount: number, reason?: string) {
    const messages = {
      PENDING: `Your withdrawal request of ₹${amount.toFixed(2)} is pending approval`,
      APPROVED: `₹${amount.toFixed(2)} has been processed and will be transferred to your bank account`,
      REJECTED: `Your withdrawal request of ₹${amount.toFixed(2)} was rejected${reason ? `: ${reason}` : ''}`
    }

    return this.createNotification({
      title: status === 'APPROVED' ? 'Withdrawal Approved' : status === 'REJECTED' ? 'Withdrawal Rejected' : 'Withdrawal Pending',
      message: messages[status],
      type: status === 'APPROVED' ? 'SUCCESS' : status === 'REJECTED' ? 'ERROR' : 'INFO',
      priority: status === 'APPROVED' ? 'HIGH' : 'MEDIUM',
      target: 'SPECIFIC',
      targetUserIds: [userId]
    })
  }

  /**
   * Create KYC notification
   */
  static async notifyKYC(userId: string, status: 'SUBMITTED' | 'APPROVED' | 'REJECTED', reason?: string) {
    const messages = {
      SUBMITTED: 'Your KYC documents have been submitted and are under review',
      APPROVED: 'Your KYC has been approved! You can now start trading',
      REJECTED: `Your KYC was rejected${reason ? `: ${reason}` : ''}. Please resubmit with correct documents`
    }

    return this.createNotification({
      title: status === 'APPROVED' ? 'KYC Approved' : status === 'REJECTED' ? 'KYC Rejected' : 'KYC Submitted',
      message: messages[status],
      type: status === 'APPROVED' ? 'SUCCESS' : status === 'REJECTED' ? 'ERROR' : 'INFO',
      priority: status === 'APPROVED' ? 'HIGH' : status === 'REJECTED' ? 'HIGH' : 'MEDIUM',
      target: 'SPECIFIC',
      targetUserIds: [userId]
    })
  }

  /**
   * Create position notification
   */
  static async notifyPosition(userId: string, action: 'OPENED' | 'CLOSED', symbol: string, pnl?: number) {
    if (action === 'CLOSED' && pnl !== undefined) {
      return this.createNotification({
        title: "Position Closed",
        message: `Your position in ${symbol} has been closed with ${pnl >= 0 ? 'profit' : 'loss'} of ₹${Math.abs(pnl).toFixed(2)}`,
        type: pnl >= 0 ? 'SUCCESS' : 'WARNING',
        priority: 'HIGH',
        target: 'SPECIFIC',
        targetUserIds: [userId]
      })
    }

    return this.createNotification({
      title: "Position Opened",
      message: `New position opened for ${symbol}`,
      type: 'INFO',
      priority: 'MEDIUM',
      target: 'SPECIFIC',
      targetUserIds: [userId]
    })
  }

  /**
   * Create risk alert notification
   */
  static async notifyRiskAlert(userId: string, message: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') {
    const priorityMap: Record<string, NotificationPriority> = {
      LOW: 'LOW',
      MEDIUM: 'MEDIUM',
      HIGH: 'HIGH',
      CRITICAL: 'URGENT'
    }

    return this.createNotification({
      title: "Risk Alert",
      message,
      type: severity === 'CRITICAL' ? 'ERROR' : severity === 'HIGH' ? 'WARNING' : 'INFO',
      priority: priorityMap[severity] || 'MEDIUM',
      target: 'SPECIFIC',
      targetUserIds: [userId]
    })
  }

  /**
   * Create margin call notification
   */
  static async notifyMarginCall(userId: string, availableMargin: number, requiredMargin: number) {
    return this.createNotification({
      title: "Margin Call",
      message: `Low margin warning! Available: ₹${availableMargin.toFixed(2)}, Required: ₹${requiredMargin.toFixed(2)}`,
      type: 'WARNING',
      priority: 'HIGH',
      target: 'SPECIFIC',
      targetUserIds: [userId]
    })
  }
}
