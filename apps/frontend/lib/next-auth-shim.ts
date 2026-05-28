/**
 * File:        apps/frontend/lib/next-auth-shim.ts
 * Module:      next-auth compatibility shim (both main + react entry points)
 * Purpose:     Provides the same API surface as next-auth.
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-18
 */

"use client"

import { useContext } from "react"
import { AuthContext } from "@/components/providers/AuthProvider"
import { useRouter } from "next/navigation"

export interface Session {
  user?: {
    id?: string
    name?: string | null
    email?: string | null
    image?: string | null
    clientId?: string
    role?: string
  }
  expires?: string
}

export interface SignInOptions {
  redirect?: boolean
  callbackUrl?: string
}

function useSession() {
  const auth = useContext(AuthContext)
  return {
    data: auth.user
      ? {
          user: {
            id: auth.user.id,
            name: auth.user.name,
            email: auth.user.email,
            image: auth.user.profileImage,
            clientId: auth.user.clientId,
            role: auth.user.role,
          },
        }
      : null,
    status: auth.isLoading ? "loading" : auth.user ? "authenticated" : "unauthenticated",
  } as { data: Session | null; status: "loading" | "authenticated" | "unauthenticated" }
}

function signIn(
  _provider?: string,
  options?: SignInOptions
) {
  const router = useRouter()
  if (options?.redirect !== false) {
    router.push("/auth/login")
  }
}

function signOut(options?: { callbackUrl?: string; redirect?: boolean }) {
  const router = useRouter()
  const { logout } = useContext(AuthContext)
  logout()
  if (options?.redirect !== false) {
    router.push(options.callbackUrl || "/auth/login")
  }
}

export { useSession, signIn, signOut }
export type { Session, SignInOptions }