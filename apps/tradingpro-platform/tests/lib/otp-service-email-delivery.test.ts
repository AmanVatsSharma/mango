/**
 * @file otp-service-email-delivery.test.ts
 * @module lib/otp-service
 * @description Verifies OTP email delivery metadata and non-blocking SMS-first behavior
 * @author StockTrade
 * @created 2026-02-16
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    otpToken: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock("@/lib/aws-sns", () => ({
  sendOtpSMS: jest.fn(),
  generateOTP: jest.fn(),
}))

jest.mock("@/lib/ResendMail", () => ({
  sendOtpEmail: jest.fn(),
}))

jest.mock("@/lib/database-transactions", () => ({
  withOtpTransaction: jest.fn(),
  withPhoneVerificationTransaction: jest.fn(),
}))

import { OtpService } from "@/lib/otp-service"

const { prisma: mockPrisma } = jest.requireMock("@/lib/prisma") as any
const { sendOtpSMS: mockSendOtpSMS, generateOTP: mockGenerateOTP } = jest.requireMock("@/lib/aws-sns") as any
const { sendOtpEmail: mockSendOtpEmail } = jest.requireMock("@/lib/ResendMail") as any
const { withOtpTransaction: mockWithOtpTransaction } = jest.requireMock("@/lib/database-transactions") as any

describe("OtpService email delivery metadata", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.otpToken.findFirst.mockResolvedValue(null)
    mockGenerateOTP.mockReturnValue("123456")
    mockWithOtpTransaction.mockResolvedValue({ id: "otp-token-1" })
    mockPrisma.user.findUnique.mockResolvedValue({ email: "user@tradebazar.live" })
  })

  it("keeps OTP success when SMS succeeds but email fails, and exposes emailError", async () => {
    mockSendOtpSMS.mockResolvedValue({ success: true, messageId: "sms-1", data: { development: false } })
    mockSendOtpEmail.mockResolvedValue({ success: false, error: "Resend is temporarily unavailable" })

    const result = await OtpService.generateAndSendOtp("user-1", "9876543210", "LOGIN_VERIFICATION")

    expect(result.success).toBe(true)
    expect(result.data?.emailAttempted).toBe(true)
    expect(result.data?.emailEnqueued).toBe(false)
    expect(result.data?.emailError).toBe("Resend is temporarily unavailable")
    expect(result.message).toContain("OTP sent successfully")
  })

  it("marks email as not attempted when user has no email", async () => {
    mockSendOtpSMS.mockResolvedValue({ success: true, messageId: "sms-2", data: { development: false } })
    mockPrisma.user.findUnique.mockResolvedValue({ email: null })

    const result = await OtpService.generateAndSendOtp("user-2", "9999999999", "PHONE_VERIFICATION")

    expect(result.success).toBe(true)
    expect(result.data?.emailAttempted).toBe(false)
    expect(result.data?.emailEnqueued).toBe(false)
    expect(result.data?.emailError).toBeUndefined()
    expect(mockSendOtpEmail).not.toHaveBeenCalled()
  })
})
