/**
 * File:        apps/broker-admin/src/app/api/[...path]/route.ts
 * Module:      broker-admin · API Proxy
 * Purpose:     Catch-all route that proxies all /api/* requests to the NestJS
 *              backend running at localhost:3000. Preserves authentication headers
 *              (Authorization, x-tenant-id) and the request method so the backend
 *              can apply its own auth guards.
 *
 * Exports:
 *   - GET handler  — proxy GET requests
 *   - POST handler — proxy POST requests
 *   - PUT handler  — proxy PUT requests
 *   - PATCH handler — proxy PATCH requests
 *   - DELETE handler — proxy DELETE requests
 *
 * Depends on:
 *   - Next.js Request/Response Web APIs
 *
 * Side-effects: Forward-only HTTP proxy — no response body transformation.
 *
 * Key invariants:
 *   - The rewrite in next.config.js handles most paths in non-static mode.
 *     This catch-all is the fallback for environments where rewrites are not
 *     available (static export, CDN deployments) or for server-side requests
 *     that need auth header forwarding.
 *   - x-tenant-id and Authorization headers are forwarded unchanged.
 *   - Request body is forwarded as-is for POST/PUT/PATCH.
 *
 * Read order:
 *   1. route.ts — start here for proxy mechanics
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env['BACKEND_URL'] ?? 'http://localhost:3000';

async function proxyRequest(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname.replace('/api', '');
  const url = `${BACKEND_URL}/api${path}${req.nextUrl.search}`;

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body: string | undefined;
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    body = await req.text();
  }

  const fetchResponse = await fetch(url, {
    method: req.method,
    headers,
    body,
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });

  const data = await fetchResponse.text();
  return new NextResponse(data, {
    status: fetchResponse.status,
    headers: {
      'Content-Type': fetchResponse.headers.get('Content-Type') ?? 'application/json',
      'x-request-id': fetchResponse.headers.get('x-request-id') ?? '',
    },
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return proxyRequest(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return proxyRequest(req);
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  return proxyRequest(req);
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  return proxyRequest(req);
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  return proxyRequest(req);
}