// app/api/auth/mobile-signin/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { signIn } from '@/auth';
import { prisma } from '@/lib/prisma';
import { resolveAccountAccess } from '@/lib/auth/account-access-policy';

export async function POST(request: NextRequest) {
  try {
    const { email, sessionToken } = await request.json();

    if (!email || !sessionToken) {
      return NextResponse.json(
        { error: 'Email and session token are required' },
        { status: 400 }
      );
    }

    // Verify the session token
    const sessionAuth = await prisma.sessionAuth.findUnique({
      where: { sessionToken },
      include: { user: true }
    });

    if (!sessionAuth || sessionAuth.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 401 }
      );
    }

    // Verify the user matches
    if (sessionAuth.user.email !== email) {
      return NextResponse.json(
        { error: 'User mismatch' },
        { status: 401 }
      );
    }

    const gate = resolveAccountAccess({
      isActive: sessionAuth.user.isActive,
      suspendedAt: sessionAuth.user.suspendedAt,
    });
    if (gate.state !== 'ok') {
      return NextResponse.json(
        { error: gate.userMessage },
        { status: 403 }
      );
    }

    // Create NextAuth session
    const result = await signIn('credentials', {
      sessionToken: sessionToken,
      redirect: false
    });

    if (result?.error) {
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Mobile signin error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
