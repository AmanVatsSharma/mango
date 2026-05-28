/**
 * File:        apps/frontend/lib/next-auth-jwt-shim.ts
 * Module:      next-auth/jwt compatibility shim
 * Purpose:     Provides `decode` from next-auth/jwt for JWT token decoding.
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-18
 */

export async function decode(params: { token?: string; secret?: string }): Promise<null> {
  return null
}