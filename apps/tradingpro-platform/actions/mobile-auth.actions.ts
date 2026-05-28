// actions/mobile-auth.actions.ts
"use server"

import { mobileSignInSchema, otpVerificationSchema, mpinSetupSchema, mpinVerificationSchema, signUpSchema } from "@/schemas"
import { prisma } from "@/lib/prisma";
import { AuthError } from "next-auth";
import { resolveAccountAccess } from "@/lib/auth/account-access-policy"
import bcrypt from 'bcryptjs';
import * as z from 'zod'
import { getUserByIdentifier, getUserByEmail, getUserByPhone } from "@/data/user";
import { signIn } from "@/auth";
import crypto from "crypto";
import { OtpService } from "@/lib/otp-service";
import { MpinService } from "@/lib/mpin-service";
import { validatePhoneNumber } from "@/lib/aws-sns";
import { 
  withUserRegistrationTransaction, 
  withOtpTransaction, 
  withMpinTransaction, 
  withSessionTransaction,
  withPhoneVerificationTransaction,
  handleTransactionError 
} from "@/lib/database-transactions";
import { authLogger, extractClientInfo, maskSensitiveData } from "@/lib/auth-logger";
import { deriveKycState, getKycRedirectMessage, requiresKycRedirect } from "@/lib/auth/kyc-gating";
import { getKycEnforcementFromDB } from "@/lib/server/kyc-enforcement";
import { getAppRoute, getAuthRoute } from "@/lib/branding-routes";
import {
  canonicalEmailForPersistence,
  canonicalPhoneForPersistence,
} from "@/lib/identity/user-contact-canonical";

const AUTH_KYC_ROUTE = getAuthRoute("kyc")
const DASHBOARD_ROUTE = getAppRoute("dashboard")

interface AuthUserData {
  userId?: string;
  phone?: string | null;
  emailEnqueued?: boolean;
  emailAttempted?: boolean;
  emailError?: string;
  emailEnqueuedAt?: string;
  purpose?: string;
  canSetupMpin?: boolean;
  reset?: boolean;
  clientId?: string;
}

export interface AuthResponse {
  success?: string;
  error?: string;
  redirectTo?: string;
  sessionToken?: string;
  requiresOtp?: boolean;
  requiresMpin?: boolean;
  requiresKyc?: boolean;
  kycStatus?: string;
  userData?: AuthUserData;
}

function readOtpErrorMessage(otpResult: { message?: string; error?: string } | undefined, fallback: string): string {
  if (!otpResult) return fallback;
  return otpResult.message || otpResult.error || fallback;
}

/**
 * Step 1: Mobile/ClientId Login with Password
 */
export const mobileLogin = async (values: z.infer<typeof mobileSignInSchema>, req?: any): Promise<AuthResponse> => {
  const validatedFields = mobileSignInSchema.safeParse(values)

  if (!validatedFields.success) {
    try {
      await authLogger.logSecurityEvent(
        'LOGIN_FAILED',
        'Invalid login fields provided',
        { identifier: values.identifier, errorCode: 'VALIDATION_ERROR' }
      );
    } catch (logError) {
      console.error('Failed to log security event:', logError);
    }
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ");
    return { error: `Invalid input: ${errors}. Use your Mobile or Client ID and password.` }
  }

  const { identifier, password } = validatedFields.data

  try {
    // Find user by mobile number or clientId
    const existingUser = await getUserByIdentifier(identifier)
    
    // Log login attempt with actual user ID if found
    try {
      await authLogger.logLogin(
        'LOGIN_ATTEMPT',
        existingUser?.id || 'unknown',
        identifier,
        extractClientInfo(req)
      );
    } catch (logError) {
      console.error('Failed to log login attempt:', logError);
    }

    if (!existingUser || !existingUser.password) {
      try {
        await authLogger.logSecurityEvent(
          'LOGIN_FAILED',
          'Invalid mobile number or Client ID',
          { identifier, errorCode: 'USER_NOT_FOUND' }
        );
      } catch (logError) {
        console.error('Failed to log security event:', logError);
      }
      return { error: "Invalid credentials. Check Mobile/Client ID and password. If you just registered, verify OTP and set mPin first." }
    }

    // Verify password
    const passwordsMatch = await bcrypt.compare(password, existingUser.password)

    if (!passwordsMatch) {
      try {
        await authLogger.logSecurityEvent(
          'LOGIN_FAILED',
          'Invalid password provided',
          { 
            userId: existingUser.id, 
            identifier, 
            errorCode: 'INVALID_PASSWORD' 
          }
        );
      } catch (logError) {
        console.error('Failed to log security event:', logError);
      }
      return { error: "Incorrect password. If forgotten, use Forgot password to reset via email/OTP." }
    }

    const accessGate = resolveAccountAccess({
      isActive: existingUser.isActive,
      suspendedAt: existingUser.suspendedAt,
    })
    if (accessGate.state !== "ok") {
      return { error: accessGate.userMessage }
    }

    // Check if phone is verified (required for mobile login)
    if (!existingUser.phoneVerified && existingUser.phone) {
      // Send OTP for phone verification
      const otpResult = await OtpService.generateAndSendOtp(
        existingUser.id,
        existingUser.phone,
        "PHONE_VERIFICATION"
      );

      if (otpResult.success) {
        const sessionToken = await MpinService.createSessionAuth(existingUser.id);
        
        // Log successful login (user authenticated, proceeding to phone verification)
        try {
          await authLogger.logLogin(
            'LOGIN_SUCCESS',
            existingUser.id,
            identifier,
            extractClientInfo(req)
          );
        } catch (logError) {
          console.error('Failed to log login success:', logError);
        }
        
        // Check if this is development mode (no real SMS sent)
        const isDevelopmentMode = otpResult.data?.development;
        
        return {
          success: isDevelopmentMode
            ? "OTP generated. Check server console for the OTP code."
            : otpResult.data?.fallback
              ? "OTP generated. SMS failed; check with support or console."
              : `Please verify the OTP sent to your mobile${otpResult.data?.emailEnqueued ? " and email" : ""}`,
          sessionToken,
          requiresOtp: true,
          userData: {
            userId: existingUser.id,
            phone: existingUser.phone,
            emailAttempted: otpResult.data?.emailAttempted,
            emailEnqueued: otpResult.data?.emailEnqueued,
            emailError: otpResult.data?.emailError,
            purpose: "PHONE_VERIFICATION"
          }
        }
      } else {
        console.error("OTP sending failed:", otpResult.error);
        return { 
          error: readOtpErrorMessage(otpResult, "Failed to send OTP. Please try again.")
        }
      }
    }

    // Check if user has mPin
    const hasMpin = await MpinService.hasMpin(existingUser.id);

    if (!hasMpin) {
      // Send OTP for mPin setup - use email if phone is not available
      const otpDestination = existingUser.phone || existingUser.email;
      if (!otpDestination) {
        return { error: "No phone or email on file. Please contact support to set up your mPIN." }
      }
      const otpResult = await OtpService.generateAndSendOtp(
        existingUser.id,
        otpDestination,
        "MPIN_SETUP"
      );

      if (otpResult.success) {
        const sessionToken = await MpinService.createSessionAuth(existingUser.id);
        
        // Log successful login (user authenticated, proceeding to mPin setup)
        try {
          await authLogger.logLogin(
            'LOGIN_SUCCESS',
            existingUser.id,
            identifier,
            extractClientInfo(req)
          );
        } catch (logError) {
          console.error('Failed to log login success:', logError);
        }
        
        return {
          success: `Please set up your mPin. OTP sent to your mobile${otpResult.data?.emailEnqueued ? " and email" : ""}.`,
          sessionToken,
          requiresOtp: true,
          userData: {
            userId: existingUser.id,
            phone: existingUser.phone,
            emailAttempted: otpResult.data?.emailAttempted,
            emailEnqueued: otpResult.data?.emailEnqueued,
            emailError: otpResult.data?.emailError,
            purpose: "MPIN_SETUP"
          }
        }
      } else {
        return { error: readOtpErrorMessage(otpResult, "Failed to send OTP for mPin setup. Please try again.") }
      }
    }

    // Check KYC status only after phone and mPin prerequisites are complete.
    const userWithKYC = await prisma.user.findUnique({
      where: { id: existingUser.id },
      include: { kyc: true }
    })
    const kycEnforcementEnabled = await getKycEnforcementFromDB()
    const kycState = deriveKycState(userWithKYC?.kyc)

    if (kycEnforcementEnabled && requiresKycRedirect(kycState)) {
      // Create NextAuth session without redirect to avoid fetch-forward errors
      // For simple registrations (no email), skip NextAuth and return directly
      if (!existingUser.email) {
        // Simple registration user - log success and redirect
        try {
          await authLogger.logLogin(
            'LOGIN_SUCCESS',
            existingUser.id,
            identifier,
            extractClientInfo(req)
          );
        } catch (logError) {
          console.error('Failed to log login success:', logError);
        }
        return {
          success: "Login successful!",
          redirectTo: "/dashboard",
          userData: {
            userId: existingUser.id,
            clientId: existingUser.clientId ?? undefined,
          }
        }
      }
      try {
        await signIn("credentials", {
          email: existingUser.email,
          password,
          redirect: false,
        } as any);
      } catch (e) {
        console.error("signIn without redirect failed:", e);
        return { error: "Failed to complete login. Please try again." }
      }

      // Log successful auth step and ask client to handle navigation
      try {
        await authLogger.logLogin(
          'LOGIN_SUCCESS',
          existingUser.id,
          identifier,
          extractClientInfo(req)
        );
      } catch (logError) {
        console.error('Failed to log login success:', logError);
      }
      
      return {
        success: getKycRedirectMessage(kycState),
        redirectTo: AUTH_KYC_ROUTE,
        requiresKyc: true,
        kycStatus: kycState,
      }
    }

    // Check user's OTP preference before requiring OTP
    let userRequiresOtp = existingUser.requireOtpOnLogin ?? true; // Default to true for security

    // Simple registration users (no email, no phone) skip OTP requirement
    const hasNoContactInfo = !existingUser.phone && !existingUser.email;
    if (hasNoContactInfo) {
      userRequiresOtp = false;
    }

    console.log("[MOBILE-LOGIN] User OTP preference: " + userRequiresOtp + " for user " + existingUser.id);

    if (!userRequiresOtp) {
      // User has disabled OTP requirement - proceed directly to mPin verification
      console.log('[MOBILE-LOGIN] OTP requirement disabled by user - skipping OTP step');
      
      const sessionToken = await MpinService.createSessionAuth(existingUser.id);
      
      // Log successful login (user authenticated, proceeding to mPin verification)
      try {
        await authLogger.logLogin(
          'LOGIN_SUCCESS',
          existingUser.id,
          identifier,
          extractClientInfo(req)
        );
      } catch (logError) {
        console.error('Failed to log login success:', logError);
      }
      
      return {
        success: "Please enter your mPin to complete login.",
        sessionToken,
        requiresMpin: true
      }
    }

    // User requires OTP - send OTP for login verification
    const otpResult = await OtpService.generateAndSendOtp(
      existingUser.id,
      existingUser.phone!,
      "LOGIN_VERIFICATION"
    );

    if (otpResult.success) {
      const sessionToken = await MpinService.createSessionAuth(existingUser.id);
      
      // Log successful login (user authenticated, proceeding to OTP verification)
      try {
        await authLogger.logLogin(
          'LOGIN_SUCCESS',
          existingUser.id,
          identifier,
          extractClientInfo(req)
        );
      } catch (logError) {
        console.error('Failed to log login success:', logError);
      }
      
        return {
          success: otpResult.data?.fallback
          ? "OTP generated. SMS failed; check with support or console."
          : `OTP sent to your mobile${otpResult.data?.emailEnqueued ? " and email" : ""}. Enter the 6-digit code to continue`,
        sessionToken,
        requiresOtp: true,
        userData: {
          userId: existingUser.id,
          phone: existingUser.phone,
          emailAttempted: otpResult.data?.emailAttempted,
          emailEnqueued: otpResult.data?.emailEnqueued,
          emailError: otpResult.data?.emailError,
          purpose: "LOGIN_VERIFICATION"
        }
      }
    } else {
      return { error: readOtpErrorMessage(otpResult, "Failed to send OTP. Please tap Resend OTP or try again later.") }
    }

  } catch (error) {
    console.error("Mobile login error:", error);
    if (error instanceof Error) {
      return { error: `Login failed: ${error.message}` }
    }
    return { error: "An unexpected error occurred. Please try again later." }
  }
}

/**
 * Step 2: Verify OTP
 */
export const verifyOtp = async (values: z.infer<typeof otpVerificationSchema>): Promise<AuthResponse> => {
  const validatedFields = otpVerificationSchema.safeParse(values)

  if (!validatedFields.success) {
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ");
    return { error: `Invalid OTP or session: ${errors}` }
  }

  const { otp, sessionToken } = validatedFields.data

  try {
    // Get session details
    const sessionAuth = await prisma.sessionAuth.findUnique({
      where: { sessionToken }
    })

    if (!sessionAuth || sessionAuth.expiresAt < new Date()) {
      return { error: "Invalid or expired session" }
    }

    // Get user details separately
    const user = await prisma.user.findUnique({
      where: { id: sessionAuth.userId }
    })

    if (!user) {
      return { error: "User not found" }
    }

    // Find the most recent OTP for this user
    const otpRecord = await prisma.otpToken.findFirst({
      where: {
        userId: user.id,
        isUsed: false,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    })

    if (!otpRecord) {
      return { error: "No valid OTP found. Please request a new one." }
    }

    // Verify OTP
    const otpResult = await OtpService.verifyOtp(
      user.id,
      user.phone!,
      otp,
      otpRecord.purpose as any
    );

    if (!otpResult.success) {
      return { error: otpResult.message }
    }

    // Handle different OTP purposes
    switch (otpRecord.purpose) {
      case "PHONE_VERIFICATION":
        await OtpService.markPhoneAsVerified(user.id);
        
        // Check if user has mPin
        const hasMpin = await MpinService.hasMpin(user.id);
        if (!hasMpin) {
          // Registration UX: once phone is verified, allow direct mPin setup.
          // Avoid triggering a second OTP (MPIN_SETUP) right after PHONE_VERIFICATION.
          return {
            success: "Phone verified! Please set up your mPin.",
            sessionToken,
            userData: {
              canSetupMpin: true
            }
          }
        }
        
        return {
          success: "Phone verified! Please enter your mPin to continue.",
          sessionToken,
          requiresMpin: true
        }

      case "MPIN_SETUP":
        console.log("🎯 MPIN_SETUP case: Setting canSetupMpin: true");
        return {
          success: "OTP verified! Please set up your mPin.",
          sessionToken,
          userData: {
            canSetupMpin: true
          }
        }

      case "LOGIN_VERIFICATION":
        return {
          success: "OTP verified! Please enter your mPin to complete login.",
          sessionToken,
          requiresMpin: true
        }

      case "MPIN_RESET":
        // When MPIN_RESET OTP is verified, allow user to set a new mPin
        return {
          success: "OTP verified! Please set a new mPin.",
          sessionToken,
          userData: {
            canSetupMpin: true,
            reset: true
          }
        }

      default:
        return { error: "Invalid OTP purpose" }
    }

  } catch (error) {
    console.error("OTP verification error:", error);
    return { error: "Failed to verify OTP. Please try again." }
  }
}

/**
 * Step 3a: Setup mPin (for new users)
 */
export const setupMpin = async (
  values: z.infer<typeof mpinSetupSchema>,
  sessionToken: string
): Promise<AuthResponse> => {
  const validatedFields = mpinSetupSchema.safeParse(values)

  if (!validatedFields.success) {
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ");
    return { error: `Invalid mPin: ${errors}` }
  }

  const { mpin } = validatedFields.data

  try {
    // Get session details
    const sessionAuth = await prisma.sessionAuth.findUnique({
      where: { sessionToken }
    })

    if (!sessionAuth || sessionAuth.expiresAt < new Date()) {
      return { error: "Invalid or expired session" }
    }

    // Get user details separately
    const user = await prisma.user.findUnique({
      where: { id: sessionAuth.userId }
    })

    if (!user) {
      return { error: "User not found" }
    }

    // Setup or reset mPin based on whether user already has one
    const hasMpin = await MpinService.hasMpin(user.id);
    const mpinResult = hasMpin
      ? await MpinService.resetMpin(user.id, mpin)
      : await MpinService.setupMpin(user.id, mpin);

    if (!mpinResult.success) {
      return { error: mpinResult.message }
    }

    // Mark mPin as verified in session
    await prisma.sessionAuth.update({
      where: { id: sessionAuth.id },
      data: { isMpinVerified: true }
    })

    // Check KYC status and redirect accordingly
    const userWithKYC = await prisma.user.findUnique({
      where: { id: user.id },
      include: { kyc: true }
    })

    const kycEnforcementEnabled = await getKycEnforcementFromDB()
    const setupMpinKycState = deriveKycState(userWithKYC?.kyc)
    if (kycEnforcementEnabled && requiresKycRedirect(setupMpinKycState)) {
      try {
        await signIn("credentials", {
          sessionToken,
          redirect: false,
        } as any)
      } catch (e) {
        console.error("signIn before KYC redirect failed after mPin setup:", e)
        return { error: "Failed to establish session. Please try signing in again." }
      }
      return {
        success: `mPin set up successfully! ${getKycRedirectMessage(setupMpinKycState)}`,
        redirectTo: AUTH_KYC_ROUTE,
        requiresKyc: true,
        kycStatus: setupMpinKycState,
      }
    }

    // Complete login - return success
    // Establish NextAuth session using sessionToken (no redirect to avoid fetch-forward issues)
    try {
      await signIn("credentials", {
        sessionToken,
        redirect: false,
      } as any);
    } catch (e) {
      console.error("signIn with sessionToken failed after mPin setup:", e);
      return { error: "Failed to finalize login. Please try again." }
    }

    return {
      success: "Login successful! Welcome to StockTrade.",
      redirectTo: DASHBOARD_ROUTE
    }

  } catch (error) {
    console.error("mPin setup error:", error);
    return { error: "Failed to set up mPin. Please try again." }
  }
}

/**
 * Step 3b: Verify mPin (for existing users)
 */
export const verifyMpin = async (values: z.infer<typeof mpinVerificationSchema>): Promise<AuthResponse> => {
  const validatedFields = mpinVerificationSchema.safeParse(values)

  if (!validatedFields.success) {
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ");
    return { error: `Invalid mPin: ${errors}` }
  }

  const { mpin, sessionToken } = validatedFields.data

  try {
    // Verify mPin for session
    const mpinResult = await MpinService.verifyMpinForSession(sessionToken, mpin);

    if (!mpinResult.success) {
      return { error: mpinResult.message }
    }

    // Get user details
    const sessionAuth = await prisma.sessionAuth.findUnique({
      where: { sessionToken }
    })

    if (!sessionAuth) {
      return { error: "Invalid session" }
    }

    // Get user with KYC details separately
    const user = await prisma.user.findUnique({
      where: { id: sessionAuth.userId },
      include: { kyc: true }
    })

    if (!user) {
      return { error: "User not found" }
    }

    // Check KYC status
    const kycEnforcementEnabled = await getKycEnforcementFromDB()
    const verifyMpinKycState = deriveKycState(user?.kyc)
    if (kycEnforcementEnabled && requiresKycRedirect(verifyMpinKycState)) {
      try {
        await signIn("credentials", {
          sessionToken,
          redirect: false,
        } as any)
      } catch (e) {
        console.error("signIn before KYC redirect failed after mPin verify:", e)
        return { error: "Failed to establish session. Please try signing in again." }
      }
      return {
        success: `mPin verified! ${getKycRedirectMessage(verifyMpinKycState)}`,
        redirectTo: AUTH_KYC_ROUTE,
        requiresKyc: true,
        kycStatus: verifyMpinKycState,
      }
    }

    // Complete login - return success
    // Establish NextAuth session using sessionToken (no redirect to avoid fetch-forward issues)
    try {
      await signIn("credentials", {
        sessionToken,
        redirect: false,
      } as any);
    } catch (e) {
      console.error("signIn with sessionToken failed after mPin verify:", e);
      // Fallback: ensure sessionAuth is marked verified, then retry once
      try {
        await prisma.sessionAuth.update({
          where: { sessionToken },
          data: { isMpinVerified: true },
        });
        await signIn("credentials", {
          sessionToken,
          redirect: false,
        } as any);
      } catch (e2) {
        console.error("Fallback signIn retry failed:", e2);
        return { error: "Failed to finalize login. Please try again." }
      }
    }

    return {
      success: "Login successful! Welcome back to StockTrade.",
      redirectTo: DASHBOARD_ROUTE
    }

  } catch (error) {
    console.error("mPin verification error:", error);
    return { error: "Failed to verify mPin. Please try again." }
  }
}

/**
 * Resend OTP
 */
export const resendOtp = async (sessionToken: string): Promise<AuthResponse> => {
  try {
    const sessionAuth = await prisma.sessionAuth.findUnique({
      where: { sessionToken }
    })

    if (!sessionAuth || sessionAuth.expiresAt < new Date()) {
      return { error: "Invalid or expired session" }
    }

    // Get user details separately
    const user = await prisma.user.findUnique({
      where: { id: sessionAuth.userId }
    })

    if (!user) {
      return { error: "User not found" }
    }

    if (!user.phone) {
      return { error: "No phone number registered" }
    }

    // Get the last OTP purpose
    const lastOtp = await prisma.otpToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" }
    })

    const purpose = lastOtp?.purpose || "LOGIN_VERIFICATION";

    const otpResult = await OtpService.generateAndSendOtp(
      user.id,
      user.phone,
      purpose as any
    );

    if (otpResult.success) {
      return {
        success: `OTP resent to ${user.phone}${otpResult.data?.emailEnqueued ? " and email" : ""}`,
        sessionToken,
        userData: {
          userId: user.id,
          phone: user.phone,
          emailAttempted: otpResult.data?.emailAttempted,
          emailEnqueued: otpResult.data?.emailEnqueued,
          emailError: otpResult.data?.emailError,
          purpose: String(purpose),
        },
      }
    } else {
      return { error: readOtpErrorMessage(otpResult, "Failed to resend OTP. Please try again.") }
    }

  } catch (error) {
    console.error("Resend OTP error:", error);
    return { error: error instanceof Error ? error.message : "Failed to resend OTP. Please try again." }
  }
}

/**
 * Request OTP for mPin reset
 */
export const requestMpinResetOtp = async (sessionToken: string): Promise<AuthResponse> => {
  try {
    const sessionAuth = await prisma.sessionAuth.findUnique({ where: { sessionToken } })
    if (!sessionAuth || sessionAuth.expiresAt < new Date()) {
      return { error: "Invalid or expired session" }
    }

    const user = await prisma.user.findUnique({ where: { id: sessionAuth.userId } })
    if (!user || !user.phone) {
      return { error: "No phone number registered" }
    }

    const otpResult = await OtpService.generateAndSendOtp(
      user.id,
      user.phone,
      "MPIN_RESET"
    );

    if (otpResult.success) {
      return {
        success: `OTP sent to ${user.phone} for mPin reset`,
        sessionToken,
        userData: {
          userId: user.id,
          phone: user.phone,
          emailAttempted: otpResult.data?.emailAttempted,
          emailEnqueued: otpResult.data?.emailEnqueued,
          emailError: otpResult.data?.emailError,
          purpose: "MPIN_RESET",
        }
      }
    }
    return { error: readOtpErrorMessage(otpResult, "Failed to send OTP") }
  } catch (error) {
    console.error("Request mPin reset OTP error:", error)
    return { error: error instanceof Error ? error.message : "Failed to send OTP. Please try again." }
  }
}

/**
 * Enhanced registration with mobile number
 */
export const registerWithMobile = async (values: z.infer<typeof signUpSchema>, req?: any): Promise<AuthResponse> => {
  const validatedFields = signUpSchema.safeParse(values)

  if (!validatedFields.success) {
    try {
      await authLogger.logSecurityEvent(
        'REGISTRATION_FAILED',
        'Invalid registration fields provided',
        { email: values.email, phone: values.phone, errorCode: 'VALIDATION_ERROR' }
      );
    } catch (logError) {
      console.error('Failed to log security event:', logError);
    }
    return { error: "Invalid fields!" }
  }

  const { email, phone, password, name, ref } = validatedFields.data
  const emailPersist = canonicalEmailForPersistence(email)
  const phonePersist = canonicalPhoneForPersistence(phone)

  try {
    // Log registration attempt (will be updated after user creation)
    try {
      await authLogger.logRegistration(
        'REGISTRATION_ATTEMPT',
        'unknown', // Will be updated when user is created
        email,
        phone,
        extractClientInfo(req)
      );
    } catch (logError) {
      console.error('Failed to log registration attempt:', logError);
    }
    // Validate phone number format
    if (!validatePhoneNumber(phone)) {
      return { error: "Please enter a valid Indian mobile number (starts 6-9, 10 digits)" }
    }

    // Check if user already exists
    const existingUserByEmail = await getUserByEmail(emailPersist)
    if (existingUserByEmail) {
      return { error: "Email already in use! Try logging in or reset password." }
    }

    const existingUserByPhone = await getUserByPhone(phonePersist)
    if (existingUserByPhone) {
      return { error: "Mobile number already in use! Use a different number or login." }
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const clientId = generateClientId();

    // Create user and trading account in a transaction
    const { user: newUser, tradingAccount } = await withUserRegistrationTransaction({
      name,
      email: emailPersist,
      phone: phonePersist,
      password: hashedPassword,
      clientId,
      ref: ref ?? null,
    });

    // Log successful registration
    try {
      await authLogger.logRegistration(
        'REGISTRATION_SUCCESS',
        newUser.id,
        email,
        phone,
        extractClientInfo(req)
      );
    } catch (logError) {
      console.error('Failed to log registration success:', logError);
    }

    // Also log to console with explicit clientId for post-registration UX debugging
    console.log(`[REGISTRATION] ✅ User created. id=${newUser.id}, clientId=${clientId}, phone=${phone}`)

    // Send OTP for phone verification
    const otpResult = await OtpService.generateAndSendOtp(
      newUser.id,
      phonePersist,
      "PHONE_VERIFICATION"
    );

      if (otpResult.success) {
      const sessionToken = await MpinService.createSessionAuth(newUser.id);
      
      // Check if this is development mode (no real SMS sent)
      const isDevelopmentMode = otpResult.data?.development;
      
      return {
        success: isDevelopmentMode
          ? `🎉 Registration successful! Your Client ID is ${clientId}. OTP generated - check server console.`
          : otpResult.data?.fallback
            ? `🎉 Registration successful! Your Client ID is ${clientId}. OTP generated - SMS failed; check support.`
            : `🎉 Registration successful! Your Client ID is ${clientId}. OTP sent to your mobile${otpResult.data?.emailEnqueued ? " and email" : ""}.`,
        sessionToken,
        requiresOtp: true,
          userData: {
          userId: newUser.id,
          phone: phonePersist,
          emailAttempted: otpResult.data?.emailAttempted,
          emailEnqueued: otpResult.data?.emailEnqueued,
          emailError: otpResult.data?.emailError,
          purpose: "PHONE_VERIFICATION",
          clientId
        }
      }
    } else {
      console.error("OTP sending failed during registration:", otpResult.error);
      // Fallback improvement: still create a temporary session so user can Resend OTP
      try {
        const sessionToken = await MpinService.createSessionAuth(newUser.id);
        return {
          success: `🎉 Registration successful! Your Client ID is ${clientId}. We couldn't send the OTP right now. Tap \"Resend OTP\" to get a new code.`,
          sessionToken,
          requiresOtp: true,
          userData: {
            userId: newUser.id,
            phone,
            emailAttempted: otpResult.data?.emailAttempted,
            emailEnqueued: false,
            emailError: otpResult.message || otpResult.error || "OTP delivery failed",
            purpose: "PHONE_VERIFICATION",
            clientId
          }
        }
      } catch (sessionError) {
        console.error("Failed to create session after OTP failure:", sessionError);
        return { 
          error: `Registration completed, but OTP could not be sent. Your Client ID is ${clientId}. Please try again later or contact support.`
        }
      }
    }

  } catch (error) {
    console.error("Registration error:", error)
    return { error: "Something went wrong during registration!" }
  }
}

function generateClientId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randomLetters = Array.from({ length: 2 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");

  const randomNumbers = Math.floor(1000 + Math.random() * 9000);

  return randomLetters + randomNumbers;
}
