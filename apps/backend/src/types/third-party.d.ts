/**
 * @file src/types/third-party.d.ts
 * @module types
 * @description Ambient declarations for third-party modules missing TypeScript types
 * @author BharatERP
 * @created 2025-09-24
 */

declare module '@socket.io/redis-adapter' {
  export function createAdapter(pubClient: any, subClient: any): any;
}


