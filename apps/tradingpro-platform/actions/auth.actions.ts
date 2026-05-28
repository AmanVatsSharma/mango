// actions/auth.ts

"use server"
import { headers } from "next/headers"
import { NewPasswordSchema, signInSchema, signUpSchema, simpleSignUpSchema } from "@/schemas"
import { prisma } from "@/lib/prisma";
import { getTrustedClientIp } from "@/lib/server/trusted-client-ip"
import { loadSessionSecurityPolicy } from "@/lib/session-security/session-security-policy"
import { computeNetworkKey, sessionSecuritySecret } from "@/lib/session-security/network-key"
import { evaluateNetworkClusterBeforeSignup } from "@/lib/session-security/network-eval"
import { createRegistrationSighting } from "@/lib/session-security/registry"
import { AuthError, CredentialsSignin } from "next-auth";
import { messageForCredentialsSigninCode, resolveAccountAccess } from "@/lib/auth/account-access-policy"
import bcrypt from 'bcryptjs';
import * as z from 'zod'
import { generatePasswordResetVerificationToken, generateVerificationToken } from "@/lib/tokens"
import { sendOtpEmail, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/ResendMail"
import { getUserByEmail, getUserByIdentifier } from "@/data/user";
import { signIn } from "@/auth";
import { getVerificationTokenByToken } from "@/data/verification-token";
import { PasswordResetResponse } from "@/types/types";
import { getPasswordResetTokenByToken } from "@/data/password-reset-toke";
import { deriveKycState, getKycRedirectMessage, requiresKycRedirect } from "@/lib/auth/kyc-gating";
import { getKycEnforcementFromDB } from "@/lib/server/kyc-enforcement";
import { getAppRoute, getAuthRoute } from "@/lib/branding-routes";
import { applyReferralAttributionOnSignup } from "@/lib/services/referral/referral-attribution";
import { ensurePlaceholderKyc } from "@/lib/database-transactions";
import { grantSignupConsentsTx } from "@/lib/comms/consent";
import {
    canonicalEmailForPersistence,
    canonicalPhoneForPersistence,
} from "@/lib/identity/user-contact-canonical";
import { isSimpleRegistrationEnabled } from "@/lib/server/workers/system-settings";

const AUTH_PHONE_VERIFICATION_ROUTE = getAuthRoute("phoneVerification")
const AUTH_MPIN_SETUP_ROUTE = getAuthRoute("mpinSetup")
const AUTH_KYC_ROUTE = getAuthRoute("kyc")
const DASHBOARD_ROUTE = getAppRoute("dashboard")
const DEFAULT_REGISTRATION_WATCHLIST_NAME = "My Watchlist"

export const login = async (values: z.infer<typeof signInSchema>) => {
    const validatedFields = signInSchema.safeParse(values)

    if (!validatedFields.success) {
        const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
        return { error: `Validation error: ${errors}` }
    }

    const { email, password } = validatedFields.data

    try {
        // Try to find user by email or clientId
        let existingUser = await getUserByEmail(email)
        if (!existingUser) {
            existingUser = await prisma.user.findUnique({ where: { clientId: email } })
        }

        if (!existingUser || !existingUser.password) {
            return { error: "Invalid credentials. Please check your email/Client ID and password." }
        }

        // Verify password first
        const passwordsMatch = await bcrypt.compare(password, existingUser.password)
        if (!passwordsMatch) {
            return { error: "Invalid credentials. Please check your email/Client ID and password." }
        }

        const accessGate = resolveAccountAccess({
            isActive: existingUser.isActive,
            suspendedAt: existingUser.suspendedAt,
        })
        if (accessGate.state !== "ok") {
            return { error: accessGate.userMessage }
        }

        // Check email verification
        if (!existingUser.emailVerified) {
            try {
                const verificationToken = await generateVerificationToken(existingUser.email!)
                await sendVerificationEmail(verificationToken.email ?? existingUser.email!, verificationToken.token)
                return { 
                    success: "Please verify your email first. A new verification link has been sent to your email.",
                    requiresEmailVerification: true 
                }
            } catch (emailError) {
                console.error("Failed to send verification email:", emailError)
                return { error: "Your email is not verified. Please contact support." }
            }
        }

        // Fetch user with KYC data
        const userWithKYC = await prisma.user.findUnique({
            where: { id: existingUser.id },
            include: { kyc: true }
        })

        // Check phone verification first
        if (!existingUser.phoneVerified && existingUser.phone) {
            return {
                success: "Please verify your phone number to continue.",
                redirectTo: AUTH_PHONE_VERIFICATION_ROUTE,
                requiresPhoneVerification: true
            }
        }

        // Check mPin setup
        if (!existingUser.mPin) {
            return {
                success: "Please set up your mPin to secure your account.",
                redirectTo: AUTH_MPIN_SETUP_ROUTE,
                requiresMpinSetup: true
            }
        }

        // Check KYC status - redirect to KYC page only when enforcement is enabled
        const kycEnforcementEnabled = await getKycEnforcementFromDB()
        const kycState = deriveKycState(userWithKYC?.kyc)
        if (kycEnforcementEnabled && requiresKycRedirect(kycState)) {
            try {
                await signIn("credentials", {
                    email: existingUser.email,
                    password,
                    redirectTo: AUTH_KYC_ROUTE
                })
                
                return {
                    success: getKycRedirectMessage(kycState),
                    redirectTo: AUTH_KYC_ROUTE,
                    requiresKyc: true,
                    kycStatus: kycState,
                }
            } catch (error) {
                if (error instanceof CredentialsSignin) {
                    const mapped = messageForCredentialsSigninCode(error.code)
                    if (mapped) return { error: mapped }
                }
                if (error instanceof AuthError) {
                    switch (error.type) {
                        case "CredentialsSignin":
                            return { error: "Authentication failed. Please try again." }
                        default:
                            return { error: "An error occurred during login. Please try again." }
                    }
                }
                throw error
            }
        }

        try {
            await signIn("credentials", {
                email: existingUser.email,
                password,
                redirectTo: DASHBOARD_ROUTE
            })
            return {
                success: "Welcome back! Logged in successfully.",
                redirectTo: DASHBOARD_ROUTE
            }
        } catch (error) {
            if (error instanceof CredentialsSignin) {
                const mapped = messageForCredentialsSigninCode(error.code)
                if (mapped) return { error: mapped }
            }
            if (error instanceof AuthError) {
                switch (error.type) {
                    case "CredentialsSignin":
                        return { error: "Authentication failed. Please verify your credentials." }
                    default:
                        return { error: "Login failed. Please try again later." }
                }
            }
            throw error
        }
    } catch (error) {
        console.error("Login error:", error)
        if (error instanceof Error) {
            return { error: `Login failed: ${error.message}` }
        }
        return { error: "An unexpected error occurred. Please try again later." }
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

export const register = async (values: z.infer<typeof signUpSchema>) => {
    const validatedFields = signUpSchema.safeParse(values)

    if (!validatedFields.success) {
        const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
        return { error: `Invalid fields: ${errors}` }
    }

    const { email, password, name, phone, ref } = validatedFields.data
    const emailPersist = canonicalEmailForPersistence(email)
    const phonePersist = phone ? canonicalPhoneForPersistence(phone) : null

    try {
        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: emailPersist },
        })

        if (existingUser) {
            return { error: "Email already registered. Please login or use forgot password." }
        }

        // Check if phone number is already in use
        if (phonePersist && phonePersist.length >= 10) {
            const existingPhone = await prisma.user.findUnique({
                where: { phone: phonePersist },
            })

            if (existingPhone) {
                return { error: "Mobile number already registered. Please login or use a different number." }
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10)
        const clientId = generateClientId();

        const policy = await loadSessionSecurityPolicy()
        if (policy.enabled) {
            const h = await headers()
            const hdr = new Headers()
            h.forEach((value, key) => hdr.set(key, value))
            const ip = getTrustedClientIp({ headers: hdr })
            const networkKey = computeNetworkKey(ip, policy.networkClusterMode, sessionSecuritySecret())
            const preSignup = await evaluateNetworkClusterBeforeSignup({ networkKey, policy })
            if (preSignup.blocked) {
                return {
                    error: "Registration from this network is restricted due to security policy. Please contact support.",
                }
            }
        }

        const newUser = await prisma.$transaction(async (tx) => {
            const nu = await tx.user.create({
                data: {
                    name,
                    email: emailPersist,
                    phone: phonePersist ?? undefined,
                    password: hashedPassword,
                    clientId,
                },
            })
            await tx.tradingAccount.create({
                data: {
                    userId: nu.id,
                    balance: 0,
                    availableMargin: 0,
                    usedMargin: 0,
                    clientId,
                },
            })
            await tx.watchlist.create({
                data: {
                    userId: nu.id,
                    name: DEFAULT_REGISTRATION_WATCHLIST_NAME,
                    isDefault: true,
                    sortOrder: 0,
                },
            })
            await ensurePlaceholderKyc(tx, nu.id)
            await applyReferralAttributionOnSignup(tx, nu.id, ref ?? null, "URL_SIGNUP")
            // Phase 12 — sign-up consents land atomically with the user record so the
            // comms engine can dispatch transactional notifications (KYC reminder, OTP
            // fallback, etc.) without immediately tripping Gate #2.
            await grantSignupConsentsTx(tx, nu.id)
            return nu
        })

        try {
            const h = await headers()
            const hdr = new Headers()
            h.forEach((value, key) => hdr.set(key, value))
            const req = new Request("http://internal/register", { headers: hdr })
            await createRegistrationSighting({ userId: newUser.id, request: req })
        } catch {
            /* [SonuRamTODO] observability: sighting failure should not block signup */
        }

        // Send verification email
        try {
            const verificationToken = await generateVerificationToken(emailPersist)
            await sendVerificationEmail(verificationToken.email, verificationToken.token)
        } catch (emailError) {
            console.error("Failed to send verification email:", emailError)
            // Continue registration even if email fails
        }

        return {
            success: "Registration successful! Please check your email to verify your account.",
            clientId
        }
    } catch (error) {
        console.error("Registration error:", error)
        if (error instanceof Error) {
            if (error.message.includes("Unique constraint")) {
                return { error: "An account with this information already exists." }
            }
            return { error: `Registration failed: ${error.message}` }
        }
        return { error: "Registration failed. Please try again later." }
    }
}

// Simple registration - no email/phone required
export const registerSimple = async (values: z.infer<typeof simpleSignUpSchema>) => {
    const validatedFields = simpleSignUpSchema.safeParse(values)

    if (!validatedFields.success) {
        const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
        return { error: `Invalid fields: ${errors}` }
    }

    const { name, password, mpin } = validatedFields.data

    // Gate simple registration behind the system-wide toggle
    const simpleRegEnabled = await isSimpleRegistrationEnabled()
    if (!simpleRegEnabled) {
        return { error: "Self-registration is currently disabled. Please contact support." }
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10)
        const hashedMpin = await bcrypt.hash(mpin, 10)
        const clientId = generateClientId();

        const policy = await loadSessionSecurityPolicy()
        if (policy.enabled) {
            const h = await headers()
            const hdr = new Headers()
            h.forEach((value, key) => hdr.set(key, value))
            const ip = getTrustedClientIp({ headers: hdr })
            const networkKey = computeNetworkKey(ip, policy.networkClusterMode, sessionSecuritySecret())
            const preSignup = await evaluateNetworkClusterBeforeSignup({ networkKey, policy })
            if (preSignup.blocked) {
                return {
                    error: "Registration from this network is restricted due to security policy. Please contact support.",
                }
            }
        }

        const newUser = await prisma.$transaction(async (tx) => {
            const nu = await tx.user.create({
                data: {
                    name,
                    password: hashedPassword,
                    mPin: hashedMpin,
                    clientId,
                    emailVerified: new Date(), // Auto-verify - no email needed
                    phoneVerified: new Date(), // Auto-verify - no phone needed
                    isActive: true,
                },
            })
            await tx.tradingAccount.create({
                data: {
                    userId: nu.id,
                    balance: 0,
                    availableMargin: 0,
                    usedMargin: 0,
                    clientId,
                },
            })
            await tx.watchlist.create({
                data: {
                    userId: nu.id,
                    name: DEFAULT_REGISTRATION_WATCHLIST_NAME,
                    isDefault: true,
                    sortOrder: 0,
                },
            })
            await ensurePlaceholderKyc(tx, nu.id)
            await grantSignupConsentsTx(tx, nu.id)
            return nu
        })

        try {
            const h = await headers()
            const hdr = new Headers()
            h.forEach((value, key) => hdr.set(key, value))
            const req = new Request("http://internal/register", { headers: hdr })
            await createRegistrationSighting({ userId: newUser.id, request: req })
        } catch {
            /* sighting failure should not block signup */
        }

        return {
            success: "Registration successful! Please save your Client ID to login.",
            clientId,
            showClientId: true, // Flag to show clientId on registration success page
        }
    } catch (error) {
        console.error("Simple registration error:", error)
        if (error instanceof Error) {
            if (error.message.includes("Unique constraint")) {
                return { error: "An account with this information already exists." }
            }
            return { error: `Registration failed: ${error.message}` }
        }
        return { error: "Registration failed. Please try again later." }
    }
}

export const newVerification = async (token: string) => {
    try {
        if (!token || !token.trim()) {
            return { error: "Invalid verification link. Please request a new one." }
        }

        const existingToken = await getVerificationTokenByToken(token)

        if (!existingToken) {
            return { error: "Invalid or expired verification link. Please request a new one." }
        }

        const hasExpired = new Date(existingToken.expires) < new Date();

        if (hasExpired) {
            // Clean up expired token
            await prisma.verificationToken.delete({ where: { token } })
            return { error: "Verification link has expired. Please request a new one from the login page." }
        }

        const existingUser = await getUserByEmail(existingToken.email)

        if (!existingUser) {
            return { error: "User account not found. Please register again." }
        }

        if (existingUser.emailVerified) {
            // Already verified, clean up token
            await prisma.verificationToken.delete({ where: { token } })
            return { success: "Email already verified! You can now login." }
        }

        // Update user email verification
        await prisma.user.update({
            where: { id: existingUser.id },
            data: {
                emailVerified: new Date(),
                email: canonicalEmailForPersistence(existingToken.email ?? ""),
            },
        });

        // Delete the used token
        await prisma.verificationToken.delete({
            where: { token },
        })

        return { success: "Email verified successfully! You can now login and complete your profile." }
    } catch (error) {
        console.error("Email verification error:", error)
        if (error instanceof Error) {
            return { error: `Verification failed: ${error.message}` }
        }
        return { error: "Failed to verify email. Please try again or contact support." }
    }
}

export const resendVerificationEmailByToken = async (token: string) => {
    try {
        if (!token || !token.trim()) {
            return { error: "Invalid verification link. Please request a new one." }
        }

        const existingToken = await getVerificationTokenByToken(token)
        if (!existingToken) {
            return { error: "Invalid or expired verification link. Please request a new one." }
        }

        const hasExpired = new Date(existingToken.expires) < new Date()
        if (hasExpired) {
            // Best-effort cleanup and regenerate a new token for the same email.
            await prisma.verificationToken.delete({ where: { token } }).catch(() => {})
            const next = await generateVerificationToken(existingToken.email)
            await sendVerificationEmail(next.email, next.token)
            return { success: "Verification link expired. A new verification email has been sent." }
        }

        await sendVerificationEmail(existingToken.email, existingToken.token)
        return { success: "Verification email resent successfully. Please check your inbox." }
    } catch (error) {
        console.error("Resend verification email error:", error)
        if (error instanceof Error) {
            return { error: `Failed to resend verification email: ${error.message}` }
        }
        return { error: "Failed to resend verification email. Please try again later." }
    }
}

export const resetPassword = async (values: { identifier: string }): Promise<PasswordResetResponse> => {
    console.log(`[AUTH] 🔄 resetPassword called with identifier: ${values.identifier?.substring(0, 3)}***`);
    
    // Robust validation
    if (!values.identifier || !values.identifier.trim()) {
        console.error(`[AUTH] ❌ resetPassword - Validation failed: identifier is empty`);
        return { error: "Email, mobile number, or Client ID is required" };
    }

    try {
        console.log(`[AUTH] 🔍 Searching for user with identifier: ${values.identifier.trim().substring(0, 3)}***`);
        // Find user by email OR phone OR clientId
        const existingUser = await getUserByIdentifier(values.identifier.trim());

        // For security, never reveal whether the user exists
        if (!existingUser) {
            console.log(`[AUTH] ⚠️ User not found (returning generic success for security)`);
            return {
                success: "If an account exists, you will receive password reset instructions via email and SMS"
            };
        }

        console.log(`[AUTH] ✅ User found: ID=${existingUser.id}, Email=${existingUser.email ? 'Yes' : 'No'}, Phone=${existingUser.phone ? 'Yes' : 'No'}`);

        let emailSent = false;
        let smsSent = false;
        let warning: string | undefined;

        // Generate a password reset token tied to the user's email
        if (existingUser.email) {
            console.log(`[AUTH] 📧 Attempting to send password reset email...`);
            try {
                const passwordResetToken = await generatePasswordResetVerificationToken(existingUser.email, existingUser.id);
                console.log(`[AUTH] 🎫 Password reset token generated: ${passwordResetToken.token.substring(0, 10)}...`);
                
                // Send password reset email with link
                await sendPasswordResetEmail(passwordResetToken.email, passwordResetToken.token);
                emailSent = true;
                console.log(`[AUTH] ✅ Password reset email sent successfully to ${existingUser.email}`);
            } catch (emailError) {
                console.error(`[AUTH] ❌ Failed to send password reset email:`, emailError);
                console.error(`[AUTH] 📋 Email error details:`, {
                    message: emailError instanceof Error ? emailError.message : 'Unknown error',
                    stack: emailError instanceof Error ? emailError.stack : undefined
                });
            }
        } else {
            console.log(`[AUTH] ⚠️ No email address on file for user - skipping email send`);
        }

        // Also send OTP via SMS if user has phone number
        if (existingUser.phone) {
            console.log(`[AUTH] 📱 Attempting to send password reset OTP via SMS...`);
            try {
                const { sendOtpSMS, generateOTP } = await import("@/lib/aws-sns");
                
                const otp = generateOTP(6);
                console.log(`[AUTH] 🔢 OTP generated for password reset`);
                
                const hashedOtp = await bcrypt.hash(otp, 10);
                const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
                console.log(`[AUTH] ⏰ OTP will expire at: ${expiresAt.toISOString()}`);

                // Save OTP to database
                const otpToken = await prisma.otpToken.create({
                    data: {
                        userId: existingUser.id,
                        phone: existingUser.phone,
                        otp: hashedOtp,
                        purpose: "PASSWORD_RESET" as any,
                        expiresAt,
                        attempts: 0,
                        isUsed: false,
                    }
                });
                console.log(`[AUTH] 💾 OTP saved to database with ID: ${otpToken.id}`);

                // Send OTP via SMS
                const smsResult = await sendOtpSMS(existingUser.phone, otp, "password reset");
                if (smsResult.success) {
                    smsSent = true;
                    console.log(`[AUTH] ✅ Password reset OTP sent successfully to mobile ${existingUser.phone}`);
                } else {
                    console.error(`[AUTH] ❌ Failed to send SMS OTP:`, smsResult.error);
                }

                // Also send OTP via email as backup
                if (existingUser.email) {
                    console.log(`[AUTH] 📧 Sending OTP via email as backup...`);
                    const backupEmailOtpResult = await sendOtpEmail(
                        existingUser.email,
                        otp,
                        "password reset",
                        expiresAt,
                        existingUser.phone,
                    );
                    if (backupEmailOtpResult.success) {
                        console.log(`[AUTH] ✅ Backup OTP email sent`);
                    } else {
                        warning = backupEmailOtpResult.error || "OTP email delivery failed";
                        console.error(`[AUTH] ❌ Backup OTP email send failed:`, warning);
                    }
                }
            } catch (smsError) {
                console.error(`[AUTH] ❌ Failed to send password reset OTP:`, smsError);
                console.error(`[AUTH] 📋 SMS error details:`, {
                    message: smsError instanceof Error ? smsError.message : 'Unknown error',
                    stack: smsError instanceof Error ? smsError.stack : undefined
                });
            }
        } else {
            console.log(`[AUTH] ⚠️ No phone number on file for user - skipping SMS send`);
        }

        const successMessage = emailSent && smsSent 
            ? "Password reset link sent to your email and OTP sent to your mobile" 
            : emailSent 
                ? "Password reset link sent to your email"
                : smsSent
                    ? "Password reset OTP sent to your mobile"
                    : "If an account exists, you will receive password reset instructions";
        
        console.log(`[AUTH] ✅ resetPassword completed. Email sent: ${emailSent}, SMS sent: ${smsSent}`);
        console.log(`[AUTH] 📤 Returning success message: "${successMessage}"`);

        if (warning) {
            console.warn(`[AUTH] ⚠️ resetPassword completed with warning: ${warning}`);
            return { success: successMessage, warning };
        }

        return { success: successMessage };
    } catch (error) {
        console.error(`[AUTH] ❌ CRITICAL ERROR in resetPassword:`, error);
        console.error(`[AUTH] 📋 Error details:`, {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            identifier: values.identifier?.substring(0, 3) + '***'
        });
        return {
            error: "Failed to process password reset request. Please try again later."
        };
    }
};

export const newPassword = async (
    values: z.infer<typeof NewPasswordSchema>,
    token?: string | null
) => {
    console.log(`[AUTH] 🔄 newPassword called with token: ${token?.substring(0, 10)}...`);
    
    try {
        // Validate token presence
        if (!token || !token.trim()) {
            console.error(`[AUTH] ❌ newPassword - No token provided`);
            return { error: "Invalid password reset link. Please request a new one." }
        }

        console.log(`[AUTH] ✅ Token present, validating password fields...`);
        const validatedFields = NewPasswordSchema.safeParse(values);

        if (!validatedFields.success) {
            const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
            console.error(`[AUTH] ❌ newPassword - Validation failed: ${errors}`);
            return { error: `Invalid password: ${errors}` };
        }
        
        const { password } = validatedFields.data
        console.log(`[AUTH] ✅ Password validation passed`);

        console.log(`[AUTH] 🔍 Looking up password reset token in database...`);
        const existingToken = await getPasswordResetTokenByToken(token)

        if (!existingToken) {
            console.error(`[AUTH] ❌ Token not found in database`);
            return { error: "Invalid or expired reset link. Please request a new one." }
        }

        console.log(`[AUTH] ✅ Token found: ID=${existingToken.id}, Email=${existingToken.email}, Expires=${existingToken.expires}`);

        const hasExpired = new Date(existingToken.expires) < new Date();

        if (hasExpired) {
            console.warn(`[AUTH] ⚠️ Token has expired. Cleaning up...`);
            // Clean up expired token
            await prisma.passwordResetToken.delete({ where: { id: existingToken.id } })
            console.log(`[AUTH] 🗑️ Expired token deleted`);
            return { error: "Reset link has expired (valid for 1 hour). Please request a new one." }
        }

        console.log(`[AUTH] ✅ Token is valid and not expired`);
        console.log(`[AUTH] 🔍 Looking up user: ${existingToken.email}`);
        
        const existingUser = await getUserByEmail(existingToken.email)

        if (!existingUser) {
            console.error(`[AUTH] ❌ User not found for email: ${existingToken.email}`);
            return { error: "User account not found. Please contact support." }
        }

        console.log(`[AUTH] ✅ User found: ID=${existingUser.id}, Name=${existingUser.name}`);
        console.log(`[AUTH] 🔐 Hashing new password...`);

        // Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10)
        console.log(`[AUTH] ✅ Password hashed successfully`);

        console.log(`[AUTH] 💾 Updating user password in database...`);
        // Update user password
        await prisma.user.update({
            where: { id: existingUser.id },
            data: { password: hashedPassword }
        });
        console.log(`[AUTH] ✅ Password updated successfully in database`);

        console.log(`[AUTH] 🗑️ Deleting used password reset token...`);
        // Delete the used token
        await prisma.passwordResetToken.delete({
            where: { id: existingToken.id }
        });
        console.log(`[AUTH] ✅ Used token deleted from database`);

        console.log(`[AUTH] ✅ newPassword completed successfully for user: ${existingUser.email}`);
        return { success: "Password updated successfully! You can now login with your new password." }
    } catch (error) {
        console.error(`[AUTH] ❌ CRITICAL ERROR in newPassword:`, error);
        console.error(`[AUTH] 📋 Error details:`, {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            token: token?.substring(0, 10) + '...'
        });
        if (error instanceof Error) {
            return { error: `Failed to reset password: ${error.message}` }
        }
        return { error: "Failed to reset password. Please try again or contact support." }
    }
}

export const sendVerificationEmailAgain = async (email :string, token: string) => {
    await sendVerificationEmail(email, token);
}