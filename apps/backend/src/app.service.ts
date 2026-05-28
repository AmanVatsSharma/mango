/**
 * File:        apps/backend/src/app.service.ts
 * Module:      Backend · Bootstrap
 * Purpose:     Default NestJS root service. Backs AppController's GET / banner.
 *              Real domain services live under modules/* — keep this trivial.
 *
 * Exports:
 *   - AppService.getHello() → string  — banner string
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - Do NOT add domain logic here. New behavior belongs in a feature module.
 *
 * Read order:
 *   1. AppService.getHello — single method
 *
 * Author:       BharatERP
 * Last-updated: 2026-05-09
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
