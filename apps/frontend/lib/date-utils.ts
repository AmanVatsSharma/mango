/**
 * @file date-utils.ts
 * @description Utility functions for consistent date/time formatting in Indian Standard Time (IST)
 * This ensures all dates and times displayed in the app are in IST timezone
 */

const IST_TIMEZONE = 'Asia/Kolkata'
const IST_LOCALE = 'en-IN'

/**
 * Format date to Indian Standard Time with various styles
 */
export const formatDateIST = (
  date: string | Date | null | undefined,
  options?: {
    includeTime?: boolean
    timeOnly?: boolean
    dateStyle?: 'full' | 'long' | 'medium' | 'short'
    timeStyle?: 'full' | 'long' | 'medium' | 'short'
  }
): string => {
  if (!date) return 'N/A'
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date'
    }

    const { includeTime = false, timeOnly = false, dateStyle, timeStyle } = options || {}

    // Time only format
    if (timeOnly) {
      return dateObj.toLocaleTimeString(IST_LOCALE, {
        timeZone: IST_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        ...(timeStyle && { timeStyle })
      })
    }

    // Date with time
    if (includeTime) {
      return dateObj.toLocaleString(IST_LOCALE, {
        timeZone: IST_TIMEZONE,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        ...(dateStyle && { dateStyle }),
        ...(timeStyle && { timeStyle })
      })
    }

    // Date only (default)
    return dateObj.toLocaleDateString(IST_LOCALE, {
      timeZone: IST_TIMEZONE,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...(dateStyle && { dateStyle })
    })
  } catch (error) {
    console.error('Error formatting date:', error)
    return 'Invalid Date'
  }
}

/**
 * Format date for display in positions/orders - compact format
 */
export const formatCompactDateIST = (date: string | Date | null | undefined): string => {
  if (!date) return 'N/A'
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date'
    }

    return dateObj.toLocaleDateString(IST_LOCALE, {
      timeZone: IST_TIMEZONE,
      day: 'numeric',
      month: 'short'
    })
  } catch (error) {
    console.error('Error formatting compact date:', error)
    return 'Invalid Date'
  }
}

/**
 * Format time for display - shows only time in IST
 */
export const formatTimeIST = (date: string | Date | null | undefined): string => {
  return formatDateIST(date, { timeOnly: true })
}

/**
 * Format date and time for display - full format
 */
export const formatDateTimeIST = (date: string | Date | null | undefined): string => {
  return formatDateIST(date, { includeTime: true })
}

/**
 * Format date for display in order history
 */
export const formatOrderDateIST = (date: string | Date | null | undefined): string => {
  if (!date) return 'N/A'
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date'
    }

    // Relative deltas are timezone-agnostic; compare raw timestamps directly.
    const diffMs = Date.now() - dateObj.getTime()
    if (diffMs < 0) return 'Just now'
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    // Less than 1 minute
    if (diffMins < 1) {
      return 'Just now'
    }
    
    // Less than 1 hour
    if (diffMins < 60) {
      return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`
    }
    
    // Less than 24 hours
    if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
    }
    
    // Less than 30 days
    if (diffDays < 30) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
    }
    
    // Older orders: preserve precise IST date + time context.
    return formatDateIST(date, { includeTime: true })
  } catch (error) {
    console.error('Error formatting order date:', error)
    return 'Invalid Date'
  }
}

/**
 * Format expiry date for F&O contracts
 */
export const formatExpiryDateIST = (date: string | Date | null | undefined): string => {
  return formatCompactDateIST(date)
}

/**
 * Get current time in IST as Date object
 */
export const getCurrentISTDate = (): Date => {
  // Compute IST time reliably without string parsing (works in all environments)
  const now = new Date()
  const utcMillis = now.getTime() + now.getTimezoneOffset() * 60000
  const istMillis = utcMillis + (5.5 * 60 * 60000) // IST is UTC+5:30
  return new Date(istMillis)
}

/**
 * Format timestamp for logs and debugging
 */
export const formatTimestampIST = (date: string | Date | null | undefined): string => {
  if (!date) return 'N/A'
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date'
    }

    return dateObj.toLocaleString(IST_LOCALE, {
      timeZone: IST_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  } catch (error) {
    console.error('Error formatting timestamp:', error)
    return 'Invalid Date'
  }
}

/**
 * Format relative time (e.g., "2 hours ago", "5 minutes ago")
 */
export const formatRelativeTimeIST = (date: string | Date | null | undefined): string => {
  if (!date) return 'N/A'
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date'
    }

    const now = getCurrentISTDate()
    const diffMs = now.getTime() - dateObj.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffSecs < 10) return 'Just now'
    if (diffSecs < 60) return `${diffSecs}s ago`
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 30) return `${diffDays}d ago`
    
    return formatDateIST(date)
  } catch (error) {
    console.error('Error formatting relative time:', error)
    return 'Invalid Date'
  }
}

/**
 * Check if date is today in IST
 */
export const isToday = (date: string | Date): boolean => {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    const today = getCurrentISTDate()
    
    return (
      dateObj.getDate() === today.getDate() &&
      dateObj.getMonth() === today.getMonth() &&
      dateObj.getFullYear() === today.getFullYear()
    )
  } catch {
    return false
  }
}

/**
 * Export constants for use in other files
 */
export const DATE_CONSTANTS = {
  TIMEZONE: IST_TIMEZONE,
  LOCALE: IST_LOCALE
} as const