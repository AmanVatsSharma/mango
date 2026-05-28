// actions/mobile-auth.actions.ts
/**
 * File:        apps/frontend/actions/mobile-auth.actions.ts
 * Module:      Mobile Auth Server Actions — client-side wrappers for NestJS auth API
 * Purpose:     Client components call these actions instead of NextAuth server actions.
 *              All actual auth logic lives in lib/api/endpoints/auth.ts which calls NestJS.
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-18
 */

"use client"

import * as z from "zod"
import {
  mobileSignInSchema,
  otpVerificationSchema,
  mpinSetupSchema,
  mpinVerificationSchema,
  signUpSchema,
} from "@/schemas"
import {
  mobileLogin as apiMobileLogin,
  verifyOtp as apiVerifyOtp,
  setupMpin as apiSetupMpin,
  verifyMpin as apiVerifyMpin,
  resendOtp as apiResendOtp,
  requestMpinResetOtp as apiRequestMpinResetOtp,
  registerWithMobile as apiRegisterWithMobile,
} from "@/lib/api/endpoints/auth"
import { AuthResponse } from "@/lib/api/endpoints/auth"

export const mobileLogin = async (
  values: z.infer<typeof mobileSignInSchema>
): Promise<AuthResponse> => {
  const validatedFields = mobileSignInSchema.safeParse(values)
  if (!validatedFields.success) {
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
    return { error: `Invalid input: ${errors}. Use your Mobile or Client ID and password.` }
  }
  return apiMobileLogin(validatedFields.data)
}

export const verifyOtp = async (
  values: z.infer<typeof otpVerificationSchema>
): Promise<AuthResponse> => {
  const validatedFields = otpVerificationSchema.safeParse(values)
  if (!validatedFields.success) {
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
    return { error: `Invalid OTP or session: ${errors}` }
  }
  return apiVerifyOtp(validatedFields.data.otp, validatedFields.data.sessionToken)
}

export const setupMpin = async (
  values: z.infer<typeof mpinSetupSchema>,
  sessionToken: string
): Promise<AuthResponse> => {
  const validatedFields = mpinSetupSchema.safeParse(values)
  if (!validatedFields.success) {
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
    return { error: `Invalid mPin: ${errors}` }
  }
  return apiSetupMpin(validatedFields.data.mpin, sessionToken)
}

export const verifyMpin = async (
  values: z.infer<typeof mpinVerificationSchema>
): Promise<AuthResponse> => {
  const validatedFields = mpinVerificationSchema.safeParse(values)
  if (!validatedFields.success) {
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
    return { error: `Invalid mPin: ${errors}` }
  }
  return apiVerifyMpin(validatedFields.data.mpin, validatedFields.data.sessionToken)
}

export const resendOtp = async (sessionToken: string): Promise<AuthResponse> => {
  return apiResendOtp(sessionToken)
}

export const requestMpinResetOtp = async (
  sessionToken: string
): Promise<AuthResponse> => {
  return apiRequestMpinResetOtp(sessionToken)
}

export const registerWithMobile = async (
  values: z.infer<typeof signUpSchema>
): Promise<AuthResponse> => {
  const validatedFields = signUpSchema.safeParse(values)
  if (!validatedFields.success) {
    return { error: "Invalid fields!" }
  }
  const { email, phone, password, name, ref } = validatedFields.data
  return apiRegisterWithMobile({ email, phone, password, name, ref })
}