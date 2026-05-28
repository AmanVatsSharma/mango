"use client"

import type React from "react"
import { ApolloClient, InMemoryCache, ApolloLink } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { Observable } from "rxjs"
import type { FetchResult } from "@apollo/client"

const noopLink = new ApolloLink(() =>
  new Observable<FetchResult>((observer) => {
    observer.next({ data: undefined })
    observer.complete()
  })
)

const client = new ApolloClient({
  link: noopLink,
  cache: new InMemoryCache(),
})

export default function ApolloProviderWrapper({ children }: { children: React.ReactNode }) {
  return <ApolloProvider client={client}>{children}</ApolloProvider>
}