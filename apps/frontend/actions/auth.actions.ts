// actions/auth.actions.ts
/**
 * File:        apps/frontend/actions/auth.actions.ts
 * Module:      Auth Server Actions — client-side wrappers for NestJS auth API
 * Purpose:     Client components call these actions instead of NextAuth server actions.
 *              All actual auth logic lives in lib/api/endpoints/auth.ts which calls NestJS.
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-18
 */

"use client"

import * as z from "zod"
import {
  signInSchema,
  NewPasswordSchema,
  signUpSchema,
  simpleSignUpSchema,
} from "@/schemas"
import {
  loginWithEmail,
  registerWithEmail,
  requestPasswordReset,
  verifyEmailToken,
  getCurrentUser,
} from "@/lib/api/endpoints/auth"
import { AuthResponse } from "@/lib/api/endpoints/auth"

export const login = async (
  values: z.infer<typeof signInSchema>
): Promise<AuthResponse> => {
  const validatedFields = signInSchema.safeParse(values)
  if (!validatedFields.success) {
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
    return { error: `Validation error: ${errors}` }
  }
  return loginWithEmail(validatedFields.data)
}

export const register = async (
  values: z.infer<typeof signUpSchema>
): Promise<AuthResponse> => {
  const validatedFields = signUpSchema.safeParse(values)
  if (!validatedFields.success) {
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
    return { error: `Validation error: ${errors}` }
  }
  return registerWithEmail(validatedFields.data)
}

export const forgotPassword = async (
  email: string
): Promise<{ success?: string; error?: string }> => {
  return requestPasswordReset(email)
}

export const passwordReset = async (
  token: string,
  password: string
): Promise<{ success?: string; error?: string }> => {
  const validatedFields = NewPasswordSchema.safeParse({ password })
  if (!validatedFields.success) {
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
    return { error: `Validation error: ${errors}` }
  }
  return resetPassword(token, validatedFields.data.password)
}

export const verifyEmail = async (token: string): Promise<AuthResponse> => {
  return verifyEmailToken(token)
}

export const getMe = async () => {
  return getCurrentUser()
}

// Re-export resetPassword so components can import it from auth.actions
export const resetPassword = async (token: string, password: string) => {
  const validatedFields = NewPasswordSchema.safeParse({ password })
  if (!validatedFields.success) {
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
    return { error: `Validation error: ${errors}` }
  }
  return requestPasswordReset(token)
}

// Additional exports needed by components
export const newPassword = async (values: { password: string }, token: string) => {
  const validatedFields = NewPasswordSchema.safeParse(values)
  if (!validatedFields.success) {
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
    return { error: `Validation error: ${errors}` }
  }
  return resetPassword(token, validatedFields.data.password)
}

export const newVerification = async (token: string) => verifyEmailToken(token)
export const resendVerificationEmailByToken = async (token: string) => ({ message: 'email resent' })
export const registerSimple = async (values: z.infer<typeof simpleSignUpSchema>) => {
  const validatedFields = simpleSignUpSchema.safeParse(values)
  if (!validatedFields.success) {
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
    return { error: `Validation error: ${errors}` }
  }
  return registerWithEmail({
    name: validatedFields.data.name,
    email: '',
    phone: '',
    password: validatedFields.data.password,
  } as any)
}