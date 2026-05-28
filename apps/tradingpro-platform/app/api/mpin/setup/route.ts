// app/api/mpin/setup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { MpinService } from "@/lib/mpin-service";
import { mpinSetupSchema } from "@/schemas";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const validationResult = mpinSetupSchema.safeParse(body);
    
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((e: any) => e.message).join(", ");
      return NextResponse.json(
        { error: `Invalid mPin: ${errors}` },
        { status: 400 }
      );
    }

    const { mpin, sessionToken } = body;

    // Get session details
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
        { error: "Session expired. Please login again to set up mPin." },
        { status: 400 }
      );
    }

    // Check if user already has an mPin
    if (sessionAuth.user.mPin) {
      return NextResponse.json(
        { error: "mPin already set up. Use reset option to change it." },
        { status: 400 }
      );
    }

    const result = await MpinService.setupMpin(sessionAuth.userId, mpin);

    if (result.success) {
      // Update session to mark mPin as verified
      await prisma.sessionAuth.update({
        where: { id: sessionAuth.id },
        data: { 
          isMpinVerified: true,
          lastActivity: new Date()
        }
      });

      return NextResponse.json({
        success: true,
        message: result.message || "mPin set up successfully!",
      });
    } else {
      return NextResponse.json(
        { error: result.message || "Failed to set up mPin" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Setup mPin API error:", error);
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Failed to set up mPin: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Failed to set up mPin. Please try again later." },
      { status: 500 }
    );
  }
}
