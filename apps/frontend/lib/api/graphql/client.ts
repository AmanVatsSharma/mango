/**
 * File:        apps/frontend/lib/api/graphql/client.ts
 * Module:      Apollo GraphQL Client for admin dashboard queries
 * Purpose:     Apollo Client configured to call NestJS GraphQL endpoint.
 *              Used for flexible admin dashboard queries that are hard to model as REST.
 *
 * Environment:
 *   NEXT_PUBLIC_GRAPHQL_URL — GraphQL endpoint (default: http://localhost:3001/graphql)
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-17
 */

import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { storage } from '../client';

const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:3001/graphql';

const httpLink = createHttpLink({
  uri: GRAPHQL_URL,
});

const authLink = setContext((_, { headers }) => {
  const token = storage.getToken();
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
});

const errorLink = onError(({ graphQLErrors, networkError, operation, forward }) => {
  if (graphQLErrors) {
    for (const err of graphQLErrors) {
      if (err.extensions?.code === 'UNAUTHENTICATED') {
        storage.removeToken();
        storage.removeRefreshToken();
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
      }
    }
  }
  if (networkError) {
    console.error('[GraphQL Network Error]', networkError);
  }
});

export const apolloClient = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
    query: { fetchPolicy: 'network-only' },
  },
});

export default apolloClient;