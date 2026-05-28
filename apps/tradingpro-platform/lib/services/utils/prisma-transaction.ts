/**
 * Prisma Transaction Wrapper Utility
 * 
 * Provides a robust wrapper for Prisma transactions with:
 * - Automatic retry logic
 * - Comprehensive error handling
 * - Transaction logging
 * - Timeout management
 */

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

// Console logs for debugging
console.log("🔧 [PRISMA-TRANSACTION] Module loaded")

export interface TransactionOptions {
  maxRetries?: number
  timeout?: number
  isolationLevel?: Prisma.TransactionIsolationLevel
  enableLogging?: boolean
}

export interface TransactionResult<T> {
  success: boolean
  data?: T
  error?: Error
  retryCount?: number
}

/**
 * Execute a function within a Prisma transaction
 * Automatically handles retries on serialization failures
 */
export async function executeInTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: TransactionOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    timeout = 30000, // 30 seconds
    isolationLevel = Prisma.TransactionIsolationLevel.ReadCommitted,
    enableLogging = true
  } = options

  console.log("🚀 [PRISMA-TRANSACTION] Starting transaction:", {
    maxRetries,
    timeout,
    isolationLevel
  })

  let lastError: Error | undefined
  let attempt = 0

  while (attempt < maxRetries) {
    attempt++
    
    if (enableLogging) {
      console.log(`🔄 [PRISMA-TRANSACTION] Attempt ${attempt}/${maxRetries}`)
    }

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          console.log("💼 [PRISMA-TRANSACTION] Transaction started")
          const result = await fn(tx)
          console.log("✅ [PRISMA-TRANSACTION] Transaction completed successfully")
          return result
        },
        {
          maxWait: timeout,
          timeout: timeout,
          isolationLevel
        }
      )

      console.log("🎉 [PRISMA-TRANSACTION] Transaction committed successfully")
      return result
      
    } catch (error: any) {
      lastError = error
      console.error(`❌ [PRISMA-TRANSACTION] Attempt ${attempt} failed:`, {
        name: error?.name,
        message: error?.message,
        code: error?.code
      })

      // Check if it's a serialization error and we should retry
      const isSerializationError = 
        error?.code === 'P2034' || 
        error?.message?.includes('serialization') ||
        error?.message?.includes('deadlock')

      if (isSerializationError && attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        console.log(`⏳ [PRISMA-TRANSACTION] Retrying after ${backoffMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, backoffMs))
        continue
      }

      // Not a serialization error or max retries reached
      console.error("💥 [PRISMA-TRANSACTION] Transaction failed permanently:", error)
      throw error
    }
  }

  console.error("💥 [PRISMA-TRANSACTION] Max retries exceeded")
  throw lastError || new Error("Transaction failed after max retries")
}

/**
 * Execute multiple operations in a transaction with rollback on any failure
 */
export async function executeAtomicOperations<T>(
  operations: Array<(tx: Prisma.TransactionClient) => Promise<any>>,
  options: TransactionOptions = {}
): Promise<T[]> {
  console.log(`🔗 [PRISMA-TRANSACTION] Executing ${operations.length} atomic operations`)
  
  return executeInTransaction(async (tx) => {
    const results: T[] = []
    
    for (let i = 0; i < operations.length; i++) {
      console.log(`⚙️ [PRISMA-TRANSACTION] Executing operation ${i + 1}/${operations.length}`)
      const result = await operations[i](tx)
      results.push(result)
      console.log(`✅ [PRISMA-TRANSACTION] Operation ${i + 1} completed`)
    }
    
    console.log("✅ [PRISMA-TRANSACTION] All atomic operations completed")
    return results
  }, options)
}

/**
 * Safe transaction wrapper that returns a result object instead of throwing
 */
export async function safeTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: TransactionOptions = {}
): Promise<TransactionResult<T>> {
  console.log("🛡️ [PRISMA-TRANSACTION] Starting safe transaction")
  
  try {
    const data = await executeInTransaction(fn, options)
    console.log("✅ [PRISMA-TRANSACTION] Safe transaction succeeded")
    return { success: true, data }
  } catch (error: any) {
    console.error("❌ [PRISMA-TRANSACTION] Safe transaction failed:", error)
    return { 
      success: false, 
      error: error instanceof Error ? error : new Error(String(error))
    }
  }
}

console.log("✅ [PRISMA-TRANSACTION] Module initialized")