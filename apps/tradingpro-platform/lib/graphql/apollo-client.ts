/**
 * File:        lib/graphql/apollo-client.ts
 * Module:      GraphQL · Apollo client shim
 * Purpose:     No-op Apollo client shim. Satisfies the import contract of
 *              of the four remaining consumers without firing any HTTP traffic.
 *
 * Exports:
 *   - default client — ApolloClient<NormalizedCacheObject> wired to a no-op link
 *
 * Depends on:
 *   - @apollo/client — ApolloClient + InMemoryCache + ApolloLink + Observable
 *
 * Side-effects:
 *   - none. The link emits `{ data: undefined }` and completes immediately.
 *
 * Key invariants:
 *   - admin-v2's Pothos GraphQL endpoint is consumed via fetch/SWR, NOT this
 *     client — so neutering this client does not affect any live feature.
 *   - All current consumers treat `data === undefined` as the empty branch.
 *     The planned next step is to migrate them to REST/SWR; this shim is the
 *     bridge that lets the dead code be deleted without touching consumers.
 *
 * Read order:
 *   1. noopLink — the ApolloLink replacement
 *   2. client — the ApolloClient wrapping it
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  type FetchResult,
} from "@apollo/client"
import { Observable } from "rxjs"

/**
 * Emits a single empty result and completes. Apollo treats this as a
 * successful query with no data — `useQuery` returns `{ data: undefined,
 * loading: false, error: undefined }`, which is the same shape the consumers
 * already handle when their previous GraphQL calls returned no rows.
 */
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

export default client
