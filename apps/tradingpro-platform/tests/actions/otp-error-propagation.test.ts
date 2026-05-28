/**
 * @file otp-error-propagation.test.ts
 * @module actions
 * @description Ensures OTP and Resend errors are preserved for UI/toast rendering
 * @author StockTrade
 * @created 2026-02-16
 */

jest.mock("next-auth", () => ({
  AuthError: class MockAuthError extends Error {
    type: string
    constructor(type = "CredentialsSignin") {
      super(type)
      this.type = type
    }
  },
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    sessionAuth: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    otpToken: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}))

jest.mock("@/lib/otp-service", () => ({
  OtpService: {
    generateAndSendOtp: jest.fn(),
    verifyOtp: jest.fn(),
    markPhoneAsVerified: jest.fn(),
  },
}))

jest.mock("@/data/user", () => ({
  getUserByIdentifier: jest.fn(),
  getUserByEmail: jest.fn(),
  getUserByPhone: jest.fn(),
}))

jest.mock("@/lib/tokens", () => ({
  generatePasswordResetVerificationToken: jest.fn(),
  generateVerificationToken: jest.fn(),
}))

jest.mock("@/lib/ResendMail", () => ({
  sendPasswordResetEmail: jest.fn(),
  sendVerificationEmail: jest.fn(),
  sendOtpEmail: jest.fn(),
}))

jest.mock("@/lib/aws-sns", () => ({
  sendOtpSMS: jest.fn(),
  generateOTP: jest.fn(),
  validatePhoneNumber: jest.fn(() => true),
}))

jest.mock("@/auth", () => ({
  signIn: jest.fn(),
}))

jest.mock("@/schemas", () => {
  const z = require("zod")
  return {
    mobileSignInSchema: z.any(),
    otpVerificationSchema: z.any(),
    mpinSetupSchema: z.any(),
    mpinVerificationSchema: z.any(),
    signUpSchema: z.any(),
    NewPasswordSchema: z.any(),
    signInSchema: z.any(),
  }
})

jest.mock("@/lib/mpin-service", () => ({
  MpinService: {
    createSessionAuth: jest.fn(),
    hasMpin: jest.fn(),
    setupMpin: jest.fn(),
    resetMpin: jest.fn(),
    verifyMpinForSession: jest.fn(),
  },
}))

jest.mock("@/lib/database-transactions", () => ({
  withUserRegistrationTransaction: jest.fn(),
  withOtpTransaction: jest.fn(),
  withMpinTransaction: jest.fn(),
  withSessionTransaction: jest.fn(),
  withPhoneVerificationTransaction: jest.fn(),
  handleTransactionError: jest.fn(),
}))

jest.mock("@/lib/auth-logger", () => ({
  authLogger: {
    logSecurityEvent: jest.fn(),
    logLogin: jest.fn(),
    logRegistration: jest.fn(),
  },
  extractClientInfo: jest.fn(() => ({})),
  maskSensitiveData: jest.fn((value: unknown) => value),
}))

jest.mock("@/lib/auth/kyc-gating", () => ({
  deriveKycState: jest.fn(() => "APPROVED"),
  getKycRedirectMessage: jest.fn(() => "Complete KYC"),
  requiresKycRedirect: jest.fn(() => false),
}))

jest.mock("@/lib/server/kyc-enforcement", () => ({
  getKycEnforcementFromDB: jest.fn(async () => true),
}))

jest.mock("@/data/verification-token", () => ({
  getVerificationTokenByToken: jest.fn(),
}))

jest.mock("@/data/password-reset-toke", () => ({
  getPasswordResetTokenByToken: jest.fn(),
}))

import { resendOtp, verifyOtp } from "@/actions/mobile-auth.actions"
import { resetPassword } from "@/actions/auth.actions"

const { prisma: mockPrisma } = jest.requireMock("@/lib/prisma") as any
const { OtpService } = jest.requireMock("@/lib/otp-service") as any
const mockGenerateAndSendOtp = OtpService.generateAndSendOtp as jest.Mock
const mockVerifyOtp = OtpService.verifyOtp as jest.Mock
const mockMarkPhoneAsVerified = OtpService.markPhoneAsVerified as jest.Mock
const { MpinService } = jest.requireMock("@/lib/mpin-service") as any
const mockHasMpin = MpinService.hasMpin as jest.Mock
const { getUserByIdentifier: mockGetUserByIdentifier } = jest.requireMock("@/data/user") as any
const {
  generatePasswordResetVerificationToken: mockGeneratePasswordResetVerificationToken,
} = jest.requireMock("@/lib/tokens") as any
const {
  sendPasswordResetEmail: mockSendPasswordResetEmail,
  sendOtpEmail: mockSendOtpEmail,
} = jest.requireMock("@/lib/ResendMail") as any
const { sendOtpSMS: mockSendOtpSMS, generateOTP: mockGenerateOTP } = jest.requireMock("@/lib/aws-sns") as any

describe("OTP error propagation in actions", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("skips second OTP after phone verification for users without mPin", async () => {
    mockPrisma.sessionAuth.findUnique.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 60_000),
    })
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      phone: "9876543210",
    })
    mockPrisma.otpToken.findFirst.mockResolvedValue({
      purpose: "PHONE_VERIFICATION",
    })
    mockVerifyOtp.mockResolvedValue({
      success: true,
      message: "OTP verified",
    })
    mockMarkPhoneAsVerified.mockResolvedValue(undefined)
    mockHasMpin.mockResolvedValue(false)

    const result = await verifyOtp({
      otp: "123456",
      sessionToken: "session-token",
    })

    expect(result.success).toContain("Phone verified")
    expect(result.userData?.canSetupMpin).toBe(true)
    expect(result.requiresOtp).toBeUndefined()
    expect(mockGenerateAndSendOtp).not.toHaveBeenCalled()
  })

  it("preserves rate-limit message from resendOtp flow", async () => {
    mockPrisma.sessionAuth.findUnique.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 60000),
    })
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      phone: "9876543210",
    })
    mockPrisma.otpToken.findFirst.mockResolvedValue({
      purpose: "LOGIN_VERIFICATION",
    })
    mockGenerateAndSendOtp.mockResolvedValue({
      success: false,
      message: "Please wait before requesting another OTP",
      error: "RATE_LIMITED",
    })

    const result = await resendOtp("session-token")

    expect(result.error).toBe("Please wait before requesting another OTP")
  })

  it("returns warning when password-reset OTP email fallback fails", async () => {
    mockGetUserByIdentifier.mockResolvedValue({
      id: "user-2",
      email: "user2@tradebazar.live",
      phone: "9876500000",
    })
    mockGeneratePasswordResetVerificationToken.mockResolvedValue({
      email: "user2@tradebazar.live",
      token: "reset-token",
    })
    mockSendPasswordResetEmail.mockResolvedValue(undefined)
    mockGenerateOTP.mockReturnValue("123456")
    mockPrisma.otpToken.create.mockResolvedValue({ id: "otp-db-id" })
    mockSendOtpSMS.mockResolvedValue({ success: true, messageId: "sms-id-1" })
    mockSendOtpEmail.mockResolvedValue({ success: false, error: "Resend service timeout" })

    const result = await resetPassword({ identifier: "user2@tradebazar.live" })

    expect(result.success).toBeTruthy()
    expect(result.warning).toBe("Resend service timeout")
  })
})
