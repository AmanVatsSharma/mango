"use client"

import type React from "react"

// Use the react entry to avoid export issues in some bundlers
import { ApolloProvider } from "@apollo/client/react"
import client from "@/lib/graphql/apollo-client"

export default function ApolloProviderWrapper({ children }: { children: React.ReactNode }) {
  return <ApolloProvider client={client}>{children}</ApolloProvider>
}
