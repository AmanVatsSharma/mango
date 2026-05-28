/**
 * File:        apps/frontend/lib/observability/logger.ts
 * Module:      Observability logger stub
 * Purpose:     Placeholder for the backend observability/logger module.
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-18
 */

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.info(msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta),
}