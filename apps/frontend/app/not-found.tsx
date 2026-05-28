/**
 * File:        apps/frontend/app/not-found.tsx
 * Module:      App · 404 page
 * Purpose:     Custom 404 error page for the UI-only frontend.
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-19
 */

import Link from "next/link"

export const dynamic = "force-dynamic"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-cyan-400">404</h1>
        <h2 className="mt-4 text-2xl font-semibold text-white">Page Not Found</h2>
        <p className="mt-2 text-slate-400">The page you&apos;re looking for doesn&apos;t exist.</p>
      </div>
      <div className="mt-6 flex gap-4">
        <Link
          href="/dashboard"
          className="rounded-md bg-cyan-600 px-6 py-3 text-white hover:bg-cyan-500"
        >
          Go to Dashboard
        </Link>
        <Link
          href="/auth/login"
          className="rounded-md border border-cyan-600 px-6 py-3 text-cyan-400 hover:bg-cyan-600/10"
        >
          Login
        </Link>
      </div>
    </div>
  )
}