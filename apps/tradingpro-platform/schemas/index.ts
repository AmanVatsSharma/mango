//schemas/index.ts
import { z } from "zod"

// Legacy email-based sign in (keeping for backward compatibility)
export const signInSchema = z.object({
    email: z.string()
        .min(1, "Email is required")
        .email("Invalid email"),
    password: z.string()
        .min(1, "Password is required")
        .min(8, "Password must be more than 8 characters")
        .max(32, "Password must be less than 32 characters"),
})

// Session security STEP_UP completion (after clustered login)
export const sessionSecurityStepUpSchema = z.object({
    email: z.string({ message:"Email is required" })
        .min(1, "Email is required")
        .email("Invalid email"),
    stepUpChallengeId: z.string({ message:"Challenge is required" }).min(1, "Challenge is required"),
    mpin: z.string({ message:"mPin is required" })
        .min(4, "mPin must be 4 digits")
        .max(6, "mPin must be 4-6 digits")
        .regex(/^\d{4,6}$/, "mPin must be only numbers"),
})

// New mobile/clientId based login schema
export const mobileSignInSchema = z.object({
    identifier: z.string({ message:"Mobile number or Client ID is required" })
        .min(1, "Mobile number or Client ID is required"),
    password: z.string({ message:"Password is required" })
        .min(1, "Password is required")
        .min(8, "Password must be more than 8 characters")
        .max(32, "Password must be less than 32 characters"),
})

// OTP verification schema
export const otpVerificationSchema = z.object({
    otp: z.string({ message:"OTP is required" })
        .min(6, "OTP must be 6 digits")
        .max(6, "OTP must be 6 digits")
        .regex(/^\d{6}$/, "OTP must contain only numbers"),
    sessionToken: z.string({ message:"Session token is required" }),
})

// mPin setup schema
export const mpinSetupSchema = z.object({
    mpin: z.string({ message:"mPin is required" })
        .min(4, "mPin must be 4 digits")
        .max(6, "mPin must be 4-6 digits")
        .regex(/^\d{4,6}$/, "mPin must contain only numbers"),
    confirmMpin: z.string({ message:"Please confirm your mPin" }),
}).refine((data) => data.mpin === data.confirmMpin, {
    message: "mPin confirmation does not match",
    path: ["confirmMpin"],
})

// mPin verification schema
export const mpinVerificationSchema = z.object({
    mpin: z.string({ message:"mPin is required" })
        .min(4, "mPin must be 4 digits")
        .max(6, "mPin must be 4-6 digits")
        .regex(/^\d{4,6}$/, "mPin must contain only numbers"),
    sessionToken: z.string({ message:"Session token is required" }),
})

export const signUpSchema = z.object({
    email: z.string()
        .min(1, "Email is required")
        .email("Invalid email"),
    phone: z.string()
        .min(10, "Please enter a valid mobile number")
        .regex(/^[6-9]\d{9}$/, "Please enter a valid Indian mobile number"),
    password: z.string()
        .min(1, "Password is required")
        .min(8, "Password must be more than 8 characters")
        .max(32, "Password must be less than 32 characters"),
    name: z.string()
        .min(3, "Name is required")
        .max(64, "Name must be less than 64 characters"),
    // Optional referral code captured from signup URL
    ref: z.string().optional(),
})

export const NewPasswordSchema = z.object({
    password: z.string({ message:"Password is required" })
        .min(1, "Password is required")
        .min(8, "Password must be more than 8 characters")
        .max(32, "Password must be less than 32 characters"),
})

// Phone verification schema
export const phoneVerificationSchema = z.object({
    phone: z.string({ message:"Mobile number is required" })
        .min(10, "Please enter a valid mobile number")
        .regex(/^[6-9]\d{9}$/, "Please enter a valid Indian mobile number"),
})

// Simple registration schema (no email/phone required)
export const simpleSignUpSchema = z.object({
    name: z.string({ message:"Name is required" })
        .min(2, "Name must be at least 2 characters")
        .max(64, "Name must be less than 64 characters"),
    password: z.string({ message:"Password is required" })
        .min(1, "Password is required")
        .min(8, "Password must be more than 8 characters")
        .max(32, "Password must be less than 32 characters"),
    mpin: z.string({ message:"mPin is required" })
        .min(4, "mPin must be 4 digits")
        .max(6, "mPin must be 4-6 digits")
        .regex(/^\d{4,6}$/, "mPin must contain only numbers"),
    confirmMpin: z.string({ message:"Please confirm your mPin" }),
}).refine((data) => data.mpin === data.confirmMpin, {
    message: "mPin confirmation does not match",
    path: ["confirmMpin"],
})

// Admin user creation schema — optional email/phone allows simple-style accounts
export const adminAddUserSchema = z.object({
    name: z.string({ message:"Name is required" })
        .min(2, "Name must be at least 2 characters")
        .max(64, "Name must be less than 64 characters"),
    email: z.string().email("Invalid email").optional().or(z.literal("")),
    phone: z.string()
        .regex(/^[6-9]\d{9}$/, "Please enter a valid Indian mobile number")
        .optional()
        .or(z.literal("")),
    password: z.string({ message:"Password is required" })
        .min(8, "Password must be at least 8 characters")
        .max(32, "Password must be less than 32 characters"),
    role: z.string({ message:"Role is required" })
        .refine((v) => ["USER", "ADMIN", "MODERATOR", "SUPER_ADMIN"].includes(v), {
            message: "Role must be one of USER, ADMIN, MODERATOR, SUPER_ADMIN",
        }),
})
