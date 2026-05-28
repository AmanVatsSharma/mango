// lib/otp-service.ts
import { prisma } from "@/lib/prisma";
import { sendOtpSMS, generateOTP } from "@/lib/aws-sns";
import { sendOtpEmail } from "@/lib/ResendMail";
import bcrypt from "bcryptjs";
import { withOtpTransaction, withPhoneVerificationTransaction } from "@/lib/database-transactions";

export type OtpPurpose = "LOGIN_VERIFICATION" | "MPIN_SETUP" | "MPIN_RESET" | "PHONE_VERIFICATION" | "TRANSACTION_AUTH" | "PASSWORD_RESET";

export interface OtpServiceResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

interface OtpDeliveryMeta {
  emailAttempted: boolean;
  emailEnqueued: boolean;
  emailError?: string;
}

export class OtpService {
  private static readonly OTP_EXPIRY_MINUTES = 5;
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly RATE_LIMIT_MINUTES = 1; // Minimum gap between OTP requests

  /**
   * Generate and send OTP to user's phone
   */
  static async generateAndSendOtp(
    userId: string,
    phone: string,
    purpose: OtpPurpose
  ): Promise<OtpServiceResponse> {
    try {
      // Check rate limiting
      const recentOtp = await prisma.otpToken.findFirst({
        where: {
          userId,
          phone,
          purpose,
          createdAt: {
            gte: new Date(Date.now() - this.RATE_LIMIT_MINUTES * 60 * 1000),
          },
        },
      });

      if (recentOtp) {
        return {
          success: false,
          message: "Please wait before requesting another OTP",
          error: "RATE_LIMITED",
        };
      }

      // Generate new OTP
      const otp = generateOTP(6);
      const hashedOtp = await bcrypt.hash(otp, 10);
      const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

      // Save OTP to database using transaction
      const otpToken = await withOtpTransaction(
        userId,
        phone,
        purpose,
        otp,
        hashedOtp,
        expiresAt
      );

      // Send OTP via SMS
      const smsResult = await sendOtpSMS(phone, otp, this.getPurposeDisplayName(purpose));

      // Also send OTP via email when available (best-effort, but with accurate delivery metadata)
      // Look up user's email once per OTP generation
      let userEmail: string | undefined;
      try {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        userEmail = u?.email || undefined;
      } catch (emailLookupError) {
        console.error("[OTP-SERVICE] Failed to lookup user email:", emailLookupError);
      }

      const deliveryMeta: OtpDeliveryMeta = {
        emailAttempted: false,
        emailEnqueued: false,
      };
      
      if (userEmail) {
        deliveryMeta.emailAttempted = true;
        console.log(`[OTP-SERVICE] 📧 Attempting to send OTP email to ${userEmail} for purpose: ${purpose}`);
        const emailResult = await sendOtpEmail(
          userEmail,
          otp,
          this.getPurposeDisplayName(purpose),
          expiresAt,
          this.maskPhoneNumber(phone),
        );
        if (emailResult.success) {
          console.log(`[OTP-SERVICE] ✅ OTP email sent successfully to ${userEmail}`);
          deliveryMeta.emailEnqueued = true;
        } else {
          deliveryMeta.emailError = emailResult.error || "Failed to send OTP email";
          console.error(`[OTP-SERVICE] ❌ Failed to send OTP email to ${userEmail}:`, deliveryMeta.emailError);
        }
      } else {
        console.log(`[OTP-SERVICE] ⚠️ No email found for user ${userId}, skipping email OTP`);
      }

      if (!smsResult.success) {
        // Fallback: keep OTP valid and log to server console so support can assist
        try {
          const masked = this.maskPhoneNumber(phone);
          console.log(
            `🔐 OTP fallback log (SMS send failed): purpose=${purpose} phone=${masked} otp=${otp} error=${smsResult.error}`
          );
        } catch (logErr) {
          // swallow logging errors
        }

        // Proceed as success with a fallback flag so UI can continue to OTP entry
        return {
          success: true,
          message: `OTP generated. SMS failed; contact support if needed.`,
          data: {
            otpId: otpToken.id,
            expiresAt,
            fallback: true,
            development: Boolean((smsResult as any)?.data?.development),
            ...deliveryMeta,
          },
        };
      }

      return {
        success: true,
        message: `OTP sent successfully to ${this.maskPhoneNumber(phone)}${deliveryMeta.emailEnqueued ? " and your email" : ""}`,
        data: {
          otpId: otpToken.id,
          expiresAt,
          messageId: smsResult.messageId,
          development: Boolean((smsResult as any)?.data?.development),
          ...deliveryMeta,
        },
      };
    } catch (error) {
      console.error("OTP generation failed:", error);
      return {
        success: false,
        message: "Failed to generate OTP. Please try again.",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Verify OTP entered by user
   */
  static async verifyOtp(
    userId: string,
    phone: string,
    otp: string,
    purpose: OtpPurpose
  ): Promise<OtpServiceResponse> {
    try {
      // Find the most recent valid OTP
      const otpToken = await prisma.otpToken.findFirst({
        where: {
          userId,
          phone,
          purpose,
          isUsed: false,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (!otpToken) {
        return {
          success: false,
          message: "Invalid or expired OTP",
          error: "OTP_NOT_FOUND",
        };
      }

      // Check max attempts
      if (otpToken.attempts >= this.MAX_ATTEMPTS) {
        await prisma.otpToken.update({
          where: { id: otpToken.id },
          data: { isUsed: true },
        });

        return {
          success: false,
          message: "OTP verification failed. Maximum attempts exceeded.",
          error: "MAX_ATTEMPTS_EXCEEDED",
        };
      }

      // Verify OTP
      const isValidOtp = await bcrypt.compare(otp, otpToken.otp);

      // Increment attempts
      await prisma.otpToken.update({
        where: { id: otpToken.id },
        data: {
          attempts: otpToken.attempts + 1,
        },
      });

      if (!isValidOtp) {
        const remainingAttempts = this.MAX_ATTEMPTS - (otpToken.attempts + 1);
        return {
          success: false,
          message: `Invalid OTP. ${remainingAttempts} attempts remaining.`,
          error: "INVALID_OTP",
        };
      }

      // Mark OTP as used
      await prisma.otpToken.update({
        where: { id: otpToken.id },
        data: { isUsed: true },
      });

      return {
        success: true,
        message: "OTP verified successfully",
        data: {
          otpId: otpToken.id,
          purpose,
        },
      };
    } catch (error) {
      console.error("OTP verification failed:", error);
      return {
        success: false,
        message: "Failed to verify OTP. Please try again.",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Clean up expired OTPs (should be called periodically)
   */
  static async cleanupExpiredOtps(): Promise<void> {
    try {
      await prisma.otpToken.deleteMany({
        where: {
          OR: [
            {
              expiresAt: {
                lt: new Date(),
              },
            },
            {
              isUsed: true,
              createdAt: {
                lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Older than 24 hours
              },
            },
          ],
        },
      });
    } catch (error) {
      console.error("Failed to cleanup expired OTPs:", error);
    }
  }

  /**
   * Get display name for OTP purpose
   */
  private static getPurposeDisplayName(purpose: OtpPurpose): string {
    const purposeMap: Record<OtpPurpose, string> = {
      LOGIN_VERIFICATION: "login",
      MPIN_SETUP: "mPin setup",
      MPIN_RESET: "mPin reset",
      PHONE_VERIFICATION: "phone verification",
      TRANSACTION_AUTH: "transaction",
      PASSWORD_RESET: "password reset",
    };

    return purposeMap[purpose] || "verification";
  }

  /**
   * Mask phone number for display
   */
  private static maskPhoneNumber(phone: string): string {
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length >= 10) {
      const lastFour = cleanPhone.slice(-4);
      const masked = cleanPhone.slice(0, -4).replace(/\d/g, "X");
      return `${masked}${lastFour}`;
    }
    return phone;
  }

  /**
   * Check if user has verified phone number
   */
  static async isPhoneVerified(userId: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { phoneVerified: true },
      });

      return !!user?.phoneVerified;
    } catch (error) {
      console.error("Failed to check phone verification:", error);
      return false;
    }
  }

  /**
   * Mark phone as verified
   */
  static async markPhoneAsVerified(userId: string): Promise<boolean> {
    try {
      await withPhoneVerificationTransaction(userId);
      return true;
    } catch (error) {
      console.error("Failed to mark phone as verified:", error);
      return false;
    }
  }
}
