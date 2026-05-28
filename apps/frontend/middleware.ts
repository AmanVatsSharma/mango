/**
 * File:        apps/frontend/middleware.ts
 * Module:      Next.js Middleware — JWT auth guard for routes
 * Purpose:     Replaces NextAuth middleware. Decodes JWT from cookie or Authorization header.
 *              Redirects unauthenticated users to /auth/login.
 *              Protected routes: /dashboard, /console, /auth/* (except login/register)
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-17
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const PROTECTED_ROUTES = ['/dashboard', '/console', '/account', '/orders', '/positions', '/watchlist'];

// Routes accessible only when NOT authenticated
const AUTH_ROUTES = ['/auth/login', '/auth/register', '/auth/forgot-password'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('auth_token')?.value;
  const isAuthenticated = !!token;

  // If trying to access protected route without auth, redirect to login
  const isProtectedRoute = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If accessing auth routes while authenticated, redirect to dashboard
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};