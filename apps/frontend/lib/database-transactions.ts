// lib/database-transactions.ts
import { prisma } from "@/lib/prisma";
import { OtpPurpose, Prisma, KycStatus } from "@prisma/client";
import { loadSessionSecurityPolicy } from "@/lib/session-security/session-security-policy";
import { registerMobileSessionAuthRow } from "@/lib/session-security/registry";
import { applyReferralAttributionOnSignup } from "@/lib/services/referral/referral-attribution";

export type PrismaTransactionClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Ensures a placeholder `KYC` row exists for `userId` (idempotent; safe for email + mobile signup).
 */
export async function ensurePlaceholderKyc(
  tx: PrismaTransactionClient,
  userId: string,
): Promise<void> {
  const existing = await tx.kYC.findUnique({ where: { userId } })
  if (existing) {
    return
  }
  await tx.kYC.create({
    data: {
      userId,
      aadhaarNumber: "",
      panNumber: "",
      bankProofUrl: "",
      bankProofKey: null,
      status: KycStatus.PENDING,
    },
  })
}

/**
 * Wrapper for database transactions with proper error handling and logging
 */
export const withTransaction = async <T>(
  operation: (tx: PrismaTransactionClient) => Promise<T>,
  options?: {
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }
): Promise<T> => {
  const startTime = Date.now();
  
  try {
    console.log("🔄 Starting database transaction");
    
    const result = await prisma.$transaction(
      async (tx) => {
        try {
          const operationResult = await operation(tx);
          console.log(`✅ Transaction completed successfully in ${Date.now() - startTime}ms`);
          return operationResult;
        } catch (error) {
          console.error("❌ Transaction operation failed:", error);
          throw error;
        }
      },
      {
        timeout: options?.timeout || 10000, // 10 seconds default
        isolationLevel: options?.isolationLevel || Prisma.TransactionIsolationLevel.ReadCommitted,
      }
    );
    
    return result;
  } catch (error) {
    console.error(`❌ Transaction failed after ${Date.now() - startTime}ms:`, error);
    throw error;
  }
};

/**
 * Transaction wrapper specifically for user registration
 * - Creates a new `User`
 * - Creates associated `TradingAccount`
 * - Creates a default `Watchlist`
 * - Creates a default `KYC` with `PENDING` status
 */
export const withUserRegistrationTransaction = async (
  userData: {
    name: string;
    email: string;
    phone: string;
    password: string;
    clientId: string;
    ref?: string | null;
  }
) => {
  return withTransaction(async (tx) => {
    // Step 1: Create user
    // Keep minimal required fields; other properties can be updated post-registration
    console.log("👤 Creating new user with clientId:", userData.clientId);
    const newUser = await tx.user.create({
      data: {
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        password: userData.password,
        clientId: userData.clientId,
      }
    });
    console.log("✅ User created:", newUser.id);

    // Step 2: Create trading account for user
    // Initializes user with a zeroed-out account
    console.log("💼 Creating trading account for user:", newUser.id);
    const tradingAccount = await tx.tradingAccount.create({
      data: {
        userId: newUser.id,
        balance: 0,
        availableMargin: 0,
        usedMargin: 0,
        clientId: userData.clientId,
      }
    });
    console.log("✅ Trading account created:", tradingAccount.id);

    // Step 3: Create default watchlist for first-time users
    // This guarantees watchlist tab is immediately usable after signup.
    console.log("📈 Creating default watchlist for user:", newUser.id);
    const defaultWatchlist = await tx.watchlist.create({
      data: {
        userId: newUser.id,
        name: "My Watchlist",
        isDefault: true,
        sortOrder: 0,
      },
    });
    console.log("✅ Default watchlist created:", defaultWatchlist.id);

    // Step 4: Default KYC row (placeholder) — shared with email `register` for CRM/KYC queue parity
    console.log("📝 Ensuring default KYC (PENDING) for user:", newUser.id);
    await ensurePlaceholderKyc(tx, newUser.id);
    console.log("✅ Default KYC ensured for:", newUser.id);

    await applyReferralAttributionOnSignup(tx, newUser.id, userData.ref ?? null, "URL_SIGNUP");

    // Final result of registration transaction
    return { user: newUser, tradingAccount };
  });
};

/**
 * Transaction wrapper for OTP operations
 */
export const withOtpTransaction = async (
  userId: string,
  phone: string,
  purpose: string,
  otp: string,
  hashedOtp: string,
  expiresAt: Date
) => {
  return withTransaction(async (tx) => {
    // Invalidate any existing OTP for this user and purpose
    await tx.otpToken.updateMany({
      where: {
        userId,
        purpose : purpose as OtpPurpose,
        isUsed: false,
      },
      data: {
        isUsed: true,
      },
    });

    // Create new OTP
    const otpToken = await tx.otpToken.create({
      data: {
        userId,
        phone,
        otp: hashedOtp,
        purpose : purpose as OtpPurpose,
        expiresAt,
      },
    });

    return otpToken;
  });
};

/**
 * Transaction wrapper for mPin operations
 */
export const withMpinTransaction = async (
  userId: string,
  hashedMpin: string
) => {
  return withTransaction(async (tx) => {
    // Update user with mPin
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { mPin: hashedMpin },
    });

    return updatedUser;
  });
};

/**
 * Transaction wrapper for session operations
 */
export const withSessionTransaction = async (
  userId: string,
  sessionToken: string,
  expiresAt: Date,
  deviceInfo?: {
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
  }
) => {
  const sessionAuth = await withTransaction(async (tx) => {
    // Clean up any existing sessions for this user
    await tx.sessionAuth.deleteMany({
      where: {
        userId,
        expiresAt: { lt: new Date() }, // Only delete expired sessions
      },
    });

    // Create new session
    return tx.sessionAuth.create({
      data: {
        userId,
        sessionToken,
        isAuthenticated: true,
        isMpinVerified: false,
        expiresAt,
        deviceId: deviceInfo?.deviceId,
        ipAddress: deviceInfo?.ipAddress,
        userAgent: deviceInfo?.userAgent,
      },
    });
  });

  try {
    const policy = await loadSessionSecurityPolicy();
    await registerMobileSessionAuthRow({
      userId,
      sessionAuthId: sessionAuth.id,
      ip: deviceInfo?.ipAddress ?? "unknown",
      userAgent: deviceInfo?.userAgent ?? "unknown",
      deviceId: deviceInfo?.deviceId,
      expiresAt,
      networkClusterMode: policy.networkClusterMode,
    });
  } catch {
    // registry failure must not break session creation
  }

  return sessionAuth;
};

/**
 * Transaction wrapper for phone verification
 */
export const withPhoneVerificationTransaction = async (userId: string) => {
  return withTransaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { phoneVerified: new Date() },
    });

    return updatedUser;
  });
};

/**
 * Transaction wrapper for KYC operations
 */
export const withKycTransaction = async (
  userId: string,
  kycData: {
    aadhaarNumber: string;
    panNumber: string;
    bankProofUrl: string;
    bankProofKey?: string | null;
  }
) => {
  return withTransaction(async (tx) => {
    // Check if KYC already exists
    const existingKyc = await tx.kYC.findUnique({
      where: { userId },
    });

    if (existingKyc) {
      // Update existing KYC
      const updatedKyc = await tx.kYC.update({
        where: { userId },
        data: {
          aadhaarNumber: kycData.aadhaarNumber,
          panNumber: kycData.panNumber,
          bankProofUrl: kycData.bankProofUrl,
          bankProofKey: kycData.bankProofKey || null,
          status: "PENDING",
          updatedAt: new Date(),
        },
      });
      return updatedKyc;
    } else {
      // Create new KYC
      const newKyc = await tx.kYC.create({
        data: {
          userId,
          aadhaarNumber: kycData.aadhaarNumber,
          panNumber: kycData.panNumber,
          bankProofUrl: kycData.bankProofUrl,
          bankProofKey: kycData.bankProofKey || null,
          status: "PENDING",
        },
      });
      return newKyc;
    }
  });
};

/**
 * Utility to handle transaction rollback scenarios
 */
export const handleTransactionError = (error: any, operation: string) => {
  console.error(`❌ Transaction error in ${operation}:`, {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });

  // Determine if this is a retryable error
  const isRetryable = 
    error.code === 'P2002' || // Unique constraint violation
    error.code === 'P2025' || // Record not found
    error.message.includes('timeout') ||
    error.message.includes('connection');

  return {
    isRetryable,
    error: isRetryable 
      ? "Service temporarily unavailable. Please try again."
      : "An unexpected error occurred. Please contact support.",
  };
};
