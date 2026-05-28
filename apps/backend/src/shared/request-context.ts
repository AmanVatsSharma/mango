/**
 * @file src/shared/request-context.ts
 * @module shared
 * @description Async request context storage for requestId, tenantId, and user correlation
 * @author BharatERP
 * @created 2025-09-18
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContextStore = {
  requestId: string;
  tenantId?: string | null;
  userId?: string | null;
};

const storage = new AsyncLocalStorage<RequestContextStore>();

export function withRequestContext<T>(
  context: RequestContextStore,
  callback: () => T,
): T {
  return storage.run(context, callback);
}

export function getRequestContext(): RequestContextStore | undefined {
  return storage.getStore();
}

export const REQUEST_ID_HEADER = 'x-request-id';
export const TENANT_ID_HEADER = 'x-tenant-id';
