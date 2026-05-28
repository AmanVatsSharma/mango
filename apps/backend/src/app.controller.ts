/**
 * File:        apps/backend/src/app.controller.ts
 * Module:      Backend · Bootstrap
 * Purpose:     Default NestJS root controller. Returns a banner string at GET /
 *              for liveness checks; production health/metrics live under
 *              /shared/observability/* (Terminus).
 *
 * Exports:
 *   - AppController.getHello() → string  — returns the banner
 *
 * Depends on:
 *   - AppService — supplies the banner text
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - Public route by design (no auth guard) — only emits a static string.
 *   - Real health endpoints live in observability, not here.
 *
 * Read order:
 *   1. AppController.getHello — single endpoint
 *
 * Author:       BharatERP
 * Last-updated: 2026-05-09
 */

import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
