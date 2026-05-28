/**
 * File:        apps/frontend/components/providers/AuthedAppProviders.tsx
 * Module:      Providers · Authenticated app shell
 * Purpose:     Bundles the providers that authenticated routes need.
 *              Replaces NextAuth SessionProvider with our own AuthProvider.
 *              Also provides Apollo Client and SWRConfig for data fetching.
 *
 * Exports:
 *   - AuthedAppProviders({ children }) — single wrapper for Auth + Apollo + SWR
 *
 * Depends on:
 *   - @/components/providers/AuthProvider — JWT auth context
 *   - @/lib/api/graphql/client — Apollo Client instance
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-18
 */

"use client"

import type { ReactNode } from "react"
import { SWRConfig } from "swr"
import { AuthProvider } from "@/components/providers/AuthProvider"
import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"

const SWR_DEFAULTS = {
  dedupingInterval: 2000,
  revalidateOnFocus: false,
  focusThrottleInterval: 5000,
  shouldRetryOnError: true,
  errorRetryInterval: 5000,
  errorRetryCount: 3,
} as const

// Apollo client for GraphQL queries (admin dashboard, etc.)
const apolloClient = new ApolloClient({
  uri: process.env.NEXT_PUBLIC_GRAPHQL_URL || "http://localhost:3001/graphql",
  cache: new InMemoryCache(),
  headers: {
    // Auth token will be added by AuthProvider context
  },
})

export function AuthedAppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ApolloProvider client={apolloClient}>
        <SWRConfig value={SWR_DEFAULTS}>{children}</SWRConfig>
      </ApolloProvider>
    </AuthProvider>
  )
}