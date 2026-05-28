// app/api/mpin/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MpinService } from "@/lib/mpin-service";
import { mpinVerificationSchema } from "@/schemas";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const validationResult = mpinVerificationSchema.safeParse(body);
    
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((e: any) => e.message).join(", ");
      return NextResponse.json(
        { error: `Invalid mPin: ${errors}` },
        { status: 400 }
      );
    }

    const { mpin, sessionToken } = validationResult.data;

    if (!sessionToken || !sessionToken.trim()) {
      return NextResponse.json(
        { error: "Invalid session. Please login again." },
        { status: 400 }
      );
    }

    const result = await MpinService.verifyMpinForSession(sessionToken, mpin);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message || "mPin verified successfully!",
      });
    } else {
      const statusCode = result.message?.includes("locked") || result.message?.includes("attempts exceeded") ? 403 : 400;
      return NextResponse.json(
        { error: result.message || "Invalid mPin" },
        { status: statusCode }
      );
    }
  } catch (error) {
    console.error("Verify mPin API error:", error);
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Failed to verify mPin: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Failed to verify mPin. Please try again later." },
      { status: 500 }
    );
  }
}
