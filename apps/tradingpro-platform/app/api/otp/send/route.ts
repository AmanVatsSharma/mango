// app/api/otp/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { OtpService, OtpPurpose } from "@/lib/otp-service";
import { auth } from "@/auth";

const VALID_PURPOSES: OtpPurpose[] = [
  "LOGIN_VERIFICATION",
  "MPIN_SETUP",
  "MPIN_RESET",
  "PHONE_VERIFICATION",
  "TRANSACTION_AUTH",
  "PASSWORD_RESET"
];

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized - Please login first" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { purpose = "LOGIN_VERIFICATION" } = body;

    // Validate purpose
    if (!VALID_PURPOSES.includes(purpose as OtpPurpose)) {
      return NextResponse.json(
        { error: "Invalid OTP purpose specified" },
        { status: 400 }
      );
    }

    const user = session.user as any;
    const phone = user.phone;

    if (!phone) {
      return NextResponse.json(
        { error: "No phone number registered with your account. Please contact support." },
        { status: 400 }
      );
    }

    const result = await OtpService.generateAndSendOtp(
      user.id,
      phone,
      purpose as OtpPurpose
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        expiresAt: result.data?.expiresAt,
        emailAttempted: result.data?.emailAttempted,
        emailSent: result.data?.emailEnqueued,
        emailError: result.data?.emailError,
      });
    } else {
      const statusCode = result.error === "RATE_LIMITED" ? 429 : 400;
      return NextResponse.json(
        { error: result.message, code: result.error },
        { status: statusCode }
      );
    }
  } catch (error) {
    console.error("Send OTP API error:", error);
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Failed to send OTP: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Failed to send OTP. Please try again later." },
      { status: 500 }
    );
  }
}
