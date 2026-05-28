export const runtime = 'nodejs';
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1` // lightweight DB ping
    return NextResponse.json({ ready: true })
  } catch (e: any) {
    return NextResponse.json({ ready: false, error: e?.message || 'db_error' }, { status: 503 })
  }
}
