// lib/mpin-service.ts
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { withMpinTransaction, withSessionTransaction } from "@/lib/database-transactions";

export interface MpinServiceResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export class MpinService {
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly LOCKOUT_DURATION_MINUTES = 15;

  /**
   * Set up mPin for user
   */
  static async setupMpin(userId: string, mpin: string): Promise<MpinServiceResponse> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { mPin: true },
      });

      if (!user) {
        return {
          success: false,
          message: "User not found",
          error: "USER_NOT_FOUND",
        };
      }

      if (user.mPin) {
        return {
          success: false,
          message: "mPin already exists. Use reset mPin instead.",
          error: "MPIN_EXISTS",
        };
      }

      // Hash and save mPin using transaction
      const hashedMpin = await bcrypt.hash(mpin, 12); // Higher cost for sensitive data

      await withMpinTransaction(userId, hashedMpin);

      return {
        success: true,
        message: "mPin set up successfully",
      };
    } catch (error) {
      console.error("mPin setup failed:", error);
      return {
        success: false,
        message: "Failed to set up mPin. Please try again.",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Verify mPin
   */
  static async verifyMpin(userId: string, mpin: string): Promise<MpinServiceResponse> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { mPin: true },
      });

      if (!user || !user.mPin) {
        return {
          success: false,
          message: "mPin not set. Please set up your mPin first.",
          error: "MPIN_NOT_SET",
        };
      }

      // Check for lockout (implement rate limiting at session level)
      const sessionAuth = await this.getSessionAuth(userId);
      if (sessionAuth && this.isUserLockedOut(sessionAuth)) {
        const lockoutEndTime = new Date(sessionAuth.lastActivity.getTime() + this.LOCKOUT_DURATION_MINUTES * 60 * 1000);
        return {
          success: false,
          message: `Account locked due to multiple failed attempts. Try again after ${lockoutEndTime.toLocaleTimeString()}`,
          error: "ACCOUNT_LOCKED",
        };
      }

      // Verify mPin
      const isValidMpin = await bcrypt.compare(mpin, user.mPin);

      if (!isValidMpin) {
        await this.recordFailedAttempt(userId);
        return {
          success: false,
          message: "Invalid mPin. Please try again.",
          error: "INVALID_MPIN",
        };
      }

      // Reset failed attempts on successful verification
      await this.resetFailedAttempts(userId);

      return {
        success: true,
        message: "mPin verified successfully",
      };
    } catch (error) {
      console.error("mPin verification failed:", error);
      return {
        success: false,
        message: "Failed to verify mPin. Please try again.",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Reset mPin
   */
  static async resetMpin(userId: string, newMpin: string): Promise<MpinServiceResponse> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!user) {
        return {
          success: false,
          message: "User not found",
          error: "USER_NOT_FOUND",
        };
      }

      // Hash and update mPin using transaction
      const hashedMpin = await bcrypt.hash(newMpin, 12);

      await withMpinTransaction(userId, hashedMpin);

      // Reset any failed attempts
      await this.resetFailedAttempts(userId);

      return {
        success: true,
        message: "mPin reset successfully",
      };
    } catch (error) {
      console.error("mPin reset failed:", error);
      return {
        success: false,
        message: "Failed to reset mPin. Please try again.",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check if user has mPin set up
   */
  static async hasMpin(userId: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { mPin: true },
      });

      return !!user?.mPin;
    } catch (error) {
      console.error("Failed to check mPin status:", error);
      return false;
    }
  }

  /**
   * Generate cryptographically secure session token
   */
  private static generateSecureSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create or update session auth record
   */
  static async createSessionAuth(
    userId: string,
    sessionToken?: string,
    deviceInfo?: {
      deviceId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<string> {
    try {
      // Generate secure session token if not provided
      const secureToken = sessionToken || this.generateSecureSessionToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const sessionAuth = await withSessionTransaction(
        userId,
        secureToken,
        expiresAt,
        deviceInfo
      );

      return sessionAuth.sessionToken;
    } catch (error) {
      console.error("Failed to create session auth:", error);
      throw error;
    }
  }

  /**
   * Verify mPin for session
   */
  static async verifyMpinForSession(
    sessionToken: string,
    mpin: string
  ): Promise<MpinServiceResponse> {
    try {
      const sessionAuth = await prisma.sessionAuth.findUnique({
        where: { sessionToken }
      });

      if (!sessionAuth || sessionAuth.expiresAt < new Date()) {
        return {
          success: false,
          message: "Invalid or expired session",
          error: "INVALID_SESSION",
        };
      }

      const mpinResult = await this.verifyMpin(sessionAuth.userId, mpin);

      if (mpinResult.success) {
        // Update session to mark mPin as verified
        await prisma.sessionAuth.update({
          where: { id: sessionAuth.id },
          data: {
            isMpinVerified: true,
            lastActivity: new Date(),
          },
        });
      }

      return mpinResult;
    } catch (error) {
      console.error("Session mPin verification failed:", error);
      return {
        success: false,
        message: "Failed to verify mPin. Please try again.",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get session auth details
   */
  private static async getSessionAuth(userId: string) {
    try {
      return await prisma.sessionAuth.findFirst({
        where: {
          userId,
          expiresAt: { gt: new Date() },
        },
        orderBy: { lastActivity: "desc" },
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if user is locked out
   */
  private static isUserLockedOut(sessionAuth: any): boolean {
    // This is a simplified implementation
    // In a real app, you might track failed attempts in a separate table
    return false; // Implement based on your requirements
  }

  /**
   * Record failed mPin attempt
   */
  private static async recordFailedAttempt(userId: string): Promise<void> {
    try {
      // Update session auth to record failed attempt
      await prisma.sessionAuth.updateMany({
        where: {
          userId,
          expiresAt: { gt: new Date() },
        },
        data: {
          lastActivity: new Date(),
        },
      });
    } catch (error) {
      console.error("Failed to record failed attempt:", error);
    }
  }

  /**
   * Reset failed attempts
   */
  private static async resetFailedAttempts(userId: string): Promise<void> {
    try {
      // Update session auth to reset attempts
      await prisma.sessionAuth.updateMany({
        where: {
          userId,
          expiresAt: { gt: new Date() },
        },
        data: {
          lastActivity: new Date(),
        },
      });
    } catch (error) {
      console.error("Failed to reset failed attempts:", error);
    }
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions(): Promise<void> {
    try {
      await prisma.sessionAuth.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });
    } catch (error) {
      console.error("Failed to cleanup expired sessions:", error);
    }
  }
}
