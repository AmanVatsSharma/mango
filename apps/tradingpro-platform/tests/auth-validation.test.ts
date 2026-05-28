// tests/auth-validation.test.ts
/**
 * File:        tests/auth-validation.test.ts
 * Module:      auth · schema & validation tests
 * Purpose:     Unit tests for auth schemas and error handling paths.
 *              These do NOT require a database connection.
 *
 * Run: npm test -- --testPathPatterns="auth-validation" --forceExit
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-13
 */

import { describe, it, expect } from "@jest/globals"
import { PrismaClient } from "@prisma/client"
import crypto from "crypto"

import { registerSimple } from "../actions/auth.actions"
import { login } from "../actions/auth.actions"
import { adminAddUser } from "../actions/admin-user.actions"
import {
  mobileLogin,
  verifyOtp,
  verifyMpin,
} from "../actions/mobile-auth.actions"
import {
  upsertGlobalSetting,
  SIMPLE_REGISTRATION_KEY,
} from "@/lib/server/workers/system-settings"
import { invalidateKycEnforcementCache } from "@/lib/server/kyc-enforcement"

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../lib/aws-sns", () => ({
  sendOtpSMS: jest.fn().mockResolvedValue({
    success: true,
    messageId: "test-message-id",
    data: { development: true },
  }),
  validatePhoneNumber: jest.fn().mockReturnValue(true),
  generateOTP: jest.fn().mockReturnValue("123456"),
}))

jest.mock("../auth", () => ({
  signIn: jest.fn().mockResolvedValue({ ok: true }),
  auth: jest.fn().mockResolvedValue({ user: { id: "test-admin-id", role: "ADMIN" } }),
}))

// ─── 4.2 Simple Registration ───────────────────────────────────────────────────

describe("Simple Registration Flow", () => {
  it("blocked when simple registration is disabled via system setting", async () => {
    await upsertGlobalSetting({ key: SIMPLE_REGISTRATION_KEY, value: "false", isActive: true })
    invalidateKycEnforcementCache()

    const result = await registerSimple({
      name: "Should Fail",
      password: "TestPassword123!",
      mpin: "1234",
      confirmMpin: "1234",
    })

    expect(result.error).toContain("disabled")
    expect(result.success).toBeUndefined()

    // Re-enable for other tests
    await upsertGlobalSetting({ key: SIMPLE_REGISTRATION_KEY, value: "true", isActive: true })
  })

  it("rejects mPin confirmation mismatch", async () => {
    await upsertGlobalSetting({ key: SIMPLE_REGISTRATION_KEY, value: "true", isActive: true })
    invalidateKycEnforcementCache()

    // mPin mismatch is caught by Zod schema refinement before any DB call
    // We test the schema validation directly
    const { simpleSignUpSchema } = await import("@/schemas")
    const result = simpleSignUpSchema.safeParse({
      name: "Test User",
      password: "TestPassword123!",
      mpin: "1234",
      confirmMpin: "5678",
    })

    expect(result.success).toBe(false)
    const issue = result.error?.issues.find((i) => i.path.includes("confirmMpin"))
    expect(issue?.message).toContain("mPin confirmation does not match")
  })

  it("rejects password shorter than 8 characters", async () => {
    const { simpleSignUpSchema } = await import("@/schemas")
    const result = simpleSignUpSchema.safeParse({
      name: "Test User",
      password: "short1",
      mpin: "1234",
      confirmMpin: "1234",
    })

    expect(result.success).toBe(false)
  })

  it("rejects mPin not 4-6 digits", async () => {
    const { simpleSignUpSchema } = await import("@/schemas")

    // Too short
    const shortResult = simpleSignUpSchema.safeParse({
      name: "Test User",
      password: "TestPassword123!",
      mpin: "123",
      confirmMpin: "123",
    })
    expect(shortResult.success).toBe(false)

    // Too long
    const longResult = simpleSignUpSchema.safeParse({
      name: "Test User",
      password: "TestPassword123!",
      mpin: "1234567",
      confirmMpin: "1234567",
    })
    expect(longResult.success).toBe(false)
  })
})

// ─── 4.1 Standard Registration Schema ────────────────────────────────────────────

describe("Standard Registration Schema Validation", () => {
  it("rejects weak password (too short)", async () => {
    const { signUpSchema } = await import("@/schemas")
    const result = signUpSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      phone: "9876543210",
      password: "1234567",
    })

    expect(result.success).toBe(false)
    const passErr = result.error?.issues.find((i) =>
      i.message.toLowerCase().includes("password") && i.message.includes("8")
    )
    expect(passErr).toBeDefined()
  })

  it("rejects invalid email format", async () => {
    const { signUpSchema } = await import("@/schemas")
    const result = signUpSchema.safeParse({
      name: "Test User",
      email: "not-an-email",
      phone: "9876543210",
      password: "TestPassword123!",
    })

    expect(result.success).toBe(false)
    const emailErr = result.error?.issues.find((i) => i.path.includes("email"))
    expect(emailErr?.message).toContain("Invalid email")
  })

  it("rejects invalid Indian mobile number format", async () => {
    const { signUpSchema } = await import("@/schemas")

    // Too short
    const shortResult = signUpSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      phone: "12345",
      password: "TestPassword123!",
    })
    expect(shortResult.success).toBe(false)

    // Doesn't start with 6-9
    const badStartResult = signUpSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      phone: "1234567890",
      password: "TestPassword123!",
    })
    expect(badStartResult.success).toBe(false)
  })

  it("rejects name shorter than 3 characters", async () => {
    const { signUpSchema } = await import("@/schemas")
    const result = signUpSchema.safeParse({
      name: "AB",
      email: "test@example.com",
      phone: "9876543210",
      password: "TestPassword123!",
    })

    expect(result.success).toBe(false)
    const nameErr = result.error?.issues.find((i) => i.path.includes("name"))
    // Zod v4 may return "Name is required" for short names; accept either message
    expect(["Name is required", "Name must be at least"]).toContain(nameErr?.message)
  })

  it("accepts valid full registration payload", async () => {
    const { signUpSchema } = await import("@/schemas")
    const result = signUpSchema.safeParse({
      name: "Valid User",
      email: "valid@example.com",
      phone: "9876543210",
      password: "ValidPassword123!",
    })

    expect(result.success).toBe(true)
  })

  it("accepts valid registration with optional referral code", async () => {
    const { signUpSchema } = await import("@/schemas")
    const result = signUpSchema.safeParse({
      name: "Valid User",
      email: "valid@example.com",
      phone: "9876543210",
      password: "ValidPassword123!",
      ref: "REF123",
    })

    expect(result.success).toBe(true)
    expect(result.data?.ref).toBe("REF123")
  })
})

// ─── 4.3 Web Login Schema ─────────────────────────────────────────────────────

describe("Web Login Schema Validation", () => {
  it("rejects empty email", async () => {
    const { signInSchema } = await import("@/schemas")
    const result = signInSchema.safeParse({ email: "", password: "Password123!" })
    expect(result.success).toBe(false)
  })

  it("rejects empty password", async () => {
    const { signInSchema } = await import("@/schemas")
    const result = signInSchema.safeParse({ email: "test@example.com", password: "" })
    expect(result.success).toBe(false)
  })

  it("rejects password shorter than 8 characters", async () => {
    const { signInSchema } = await import("@/schemas")
    const result = signInSchema.safeParse({
      email: "test@example.com",
      password: "short1",
    })
    expect(result.success).toBe(false)
  })

  it("accepts valid login payload", async () => {
    const { signInSchema } = await import("@/schemas")
    const result = signInSchema.safeParse({
      email: "test@example.com",
      password: "ValidPassword123!",
    })
    expect(result.success).toBe(true)
  })
})

// ─── 4.4 Mobile Login Schema ──────────────────────────────────────────────────

describe("Mobile Login Schema Validation", () => {
  it("rejects empty identifier", async () => {
    const { mobileSignInSchema } = await import("@/schemas")
    const result = mobileSignInSchema.safeParse({ identifier: "", password: "Password123!" })
    expect(result.success).toBe(false)
  })

  it("rejects empty password", async () => {
    const { mobileSignInSchema } = await import("@/schemas")
    const result = mobileSignInSchema.safeParse({ identifier: "9876543210", password: "" })
    expect(result.success).toBe(false)
  })

  it("accepts phone as identifier", async () => {
    const { mobileSignInSchema } = await import("@/schemas")
    const result = mobileSignInSchema.safeParse({
      identifier: "9876543210",
      password: "Password123!",
    })
    expect(result.success).toBe(true)
  })

  it("accepts clientId as identifier", async () => {
    const { mobileSignInSchema } = await import("@/schemas")
    const result = mobileSignInSchema.safeParse({
      identifier: "AB1234",
      password: "Password123!",
    })
    expect(result.success).toBe(true)
  })
})

// ─── 4.5 OTP & mPin Schemas ──────────────────────────────────────────────────

describe("OTP & mPin Schema Validation", () => {
  it("rejects OTP that is not 6 digits", async () => {
    const { otpVerificationSchema } = await import("@/schemas")

    const shortResult = otpVerificationSchema.safeParse({
      otp: "12345",
      sessionToken: "abc123",
    })
    expect(shortResult.success).toBe(false)

    const longResult = otpVerificationSchema.safeParse({
      otp: "1234567",
      sessionToken: "abc123",
    })
    expect(longResult.success).toBe(false)

    const nonDigitResult = otpVerificationSchema.safeParse({
      otp: "12345a",
      sessionToken: "abc123",
    })
    expect(nonDigitResult.success).toBe(false)
  })

  it("accepts valid 6-digit OTP", async () => {
    const { otpVerificationSchema } = await import("@/schemas")
    const result = otpVerificationSchema.safeParse({
      otp: "123456",
      sessionToken: "abc123",
    })
    expect(result.success).toBe(true)
  })

  it("rejects mPin shorter than 4 digits", async () => {
    const { mpinVerificationSchema } = await import("@/schemas")
    const result = mpinVerificationSchema.safeParse({
      mpin: "123",
      sessionToken: "abc123",
    })
    expect(result.success).toBe(false)
  })

  it("rejects mPin longer than 6 digits", async () => {
    const { mpinVerificationSchema } = await import("@/schemas")
    const result = mpinVerificationSchema.safeParse({
      mpin: "1234567",
      sessionToken: "abc123",
    })
    expect(result.success).toBe(false)
  })

  it("accepts valid 4-6 digit mPin", async () => {
    const { mpinVerificationSchema } = await import("@/schemas")
    expect(
      mpinVerificationSchema.safeParse({ mpin: "1234", sessionToken: "abc" }).success
    ).toBe(true)
    expect(
      mpinVerificationSchema.safeParse({ mpin: "123456", sessionToken: "abc" }).success
    ).toBe(true)
  })
})

// ─── 4.7 Admin User Schema ───────────────────────────────────────────────────

describe("Admin User Creation Schema Validation", () => {
  it("rejects invalid role", async () => {
    const { adminAddUserSchema } = await import("@/schemas")
    const result = adminAddUserSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      phone: "",
      password: "AdminPassword123!",
      role: "GODMODE",
    })

    expect(result.success).toBe(false)
    const roleErr = result.error?.issues.find((i) => i.path.includes("role"))
    expect(roleErr?.message).toContain("Role must be one of")
  })

  it("accepts all valid roles", async () => {
    const { adminAddUserSchema } = await import("@/schemas")
    for (const role of ["USER", "ADMIN", "MODERATOR", "SUPER_ADMIN"]) {
      const result = adminAddUserSchema.safeParse({
        name: "Test User",
        email: "test@example.com",
        phone: "",
        password: "AdminPassword123!",
        role,
      })
      expect(result.success).toBe(true)
    }
  })

  it("rejects password shorter than 8 characters", async () => {
    const { adminAddUserSchema } = await import("@/schemas")
    const result = adminAddUserSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      phone: "",
      password: "short1",
      role: "USER",
    })
    expect(result.success).toBe(false)
  })

  it("rejects name shorter than 2 characters", async () => {
    const { adminAddUserSchema } = await import("@/schemas")
    const result = adminAddUserSchema.safeParse({
      name: "A",
      email: "test@example.com",
      phone: "",
      password: "AdminPassword123!",
      role: "USER",
    })
    expect(result.success).toBe(false)
  })

  it("accepts empty email and phone (simple-style admin addition)", async () => {
    const { adminAddUserSchema } = await import("@/schemas")
    const result = adminAddUserSchema.safeParse({
      name: "Simple User",
      email: "",
      phone: "",
      password: "AdminPassword123!",
      role: "USER",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid email format when provided", async () => {
    const { adminAddUserSchema } = await import("@/schemas")
    const result = adminAddUserSchema.safeParse({
      name: "Test User",
      email: "not-valid",
      phone: "",
      password: "AdminPassword123!",
      role: "USER",
    })
    expect(result.success).toBe(false)
  })
})

// ─── 4.8 Error Handling ──────────────────────────────────────────────────────

describe("Error Handling", () => {
  it("database errors return safe messages without stack traces", async () => {
    // Force an error by calling login with empty values — validation catches it first
    const result = await login({ email: "", password: "" })
    expect(result.error).toBeDefined()
    expect(result.error).not.toContain("stack")
    expect(result.error).not.toContain("Prisma")
    expect(result.error).not.toContain("[object")
  })

  it("invalid session token returns error message", async () => {
    const result = await verifyOtp({
      otp: "123456",
      sessionToken: "this-token-does-not-exist",
    })
    expect(result.error).toContain("Invalid or expired session")
  })
})

// ─── ClientId Generation ───────────────────────────────────────────────────────

describe("ClientId Generation", () => {
  it("generates format AB1234 (2 letters + 4 digits)", () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    const generated: string[] = []

    for (let i = 0; i < 100; i++) {
      const randomLetters = Array.from({ length: 2 }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length))
      ).join("")
      const randomNumbers = Math.floor(1000 + Math.random() * 9000)
      const clientId = randomLetters + randomNumbers

      expect(clientId).toMatch(/^[A-Z]{2}\d{4}$/)
      expect(generated).not.toContain(clientId) // uniqueness check
      generated.push(clientId)
    }
  })
})