// app/api/otp/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { OtpService } from "@/lib/otp-service";
import { otpVerificationSchema } from "@/schemas";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const validationResult = otpVerificationSchema.safeParse(body);
    
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((e: any) => e.message).join(", ");
      return NextResponse.json(
        { error: `Invalid input: ${errors}` },
        { status: 400 }
      );
    }

    const { otp, sessionToken } = validationResult.data;

    // Get session details to find user
    const { prisma } = await import("@/lib/prisma");
    
    const sessionAuth = await prisma.sessionAuth.findUnique({
      where: { sessionToken },
      include: { user: true }
    });

    if (!sessionAuth) {
      return NextResponse.json(
        { error: "Invalid session. Please try logging in again." },
        { status: 400 }
      );
    }

    if (sessionAuth.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Session expired. Please request a new OTP." },
        { status: 400 }
      );
    }

    const user = sessionAuth.user;

    if (!user.phone) {
      return NextResponse.json(
        { error: "No phone number associated with this account" },
        { status: 400 }
      );
    }

    // Find the most recent OTP
    const otpRecord = await prisma.otpToken.findFirst({
      where: {
        userId: user.id,
        isUsed: false,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });

    if (!otpRecord) {
      return NextResponse.json(
        { error: "No valid OTP found. Please request a new OTP." },
        { status: 400 }
      );
    }

    const result = await OtpService.verifyOtp(
      user.id,
      user.phone,
      otp,
      otpRecord.purpose as any
    );

    if (result.success) {
      // Update session last activity
      await prisma.sessionAuth.update({
        where: { id: sessionAuth.id },
        data: { lastActivity: new Date() }
      });

      return NextResponse.json({
        success: true,
        message: result.message,
        purpose: otpRecord.purpose,
      });
    } else {
      const statusCode = result.error === "MAX_ATTEMPTS_EXCEEDED" ? 403 : 400;
      return NextResponse.json(
        { error: result.message, code: result.error },
        { status: statusCode }
      );
    }
  } catch (error) {
    console.error("Verify OTP API error:", error);
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `OTP verification failed: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Failed to verify OTP. Please try again later." },
      { status: 500 }
    );
  }
}
