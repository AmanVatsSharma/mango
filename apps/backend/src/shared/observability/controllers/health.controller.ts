/**
 * File:        apps/backend/src/shared/observability/controllers/health.controller.ts
 * Module:      shared · Observability
 * Purpose:     Terminus health endpoint; Redis check is skipped when REDIS_URL is not configured
 *
 * Exports:
 *   - HealthController — GET /health (public route)
 *
 * Depends on:
 *   - @nestjs/terminus — HealthCheckService, TypeOrmHealthIndicator
 *   - RedisHealthIndicator — optional; skipped when client absent
 *
 * Side-effects:
 *   - Executes DB ping on every GET /health call
 *
 * Key invariants:
 *   - Redis check only runs when process.env.REDIS_URL is set
 *
 * Read order:
 *   1. check() — entry point
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { RedisHealthIndicator } from '../services/redis-health.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  async check() {
    const checks = [() => this.db.pingCheck('database')];
    if (process.env.REDIS_URL) {
      checks.push(() => this.redis.isHealthy('redis'));
    }
    return this.health.check(checks);
  }
}

