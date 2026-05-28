/**
 * @file src/shared/observability/services/redis-health.indicator.ts
 * @module shared-observability
 * @description Health indicator for Redis using ioredis/redis client
 * @author BharatERP
 * @created 2025-01-09
 */

import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redis: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const client = this.redis.getClient();
      if (!client) {
        throw new HealthCheckError(
          'Redis health check failed',
          this.getStatus(key, false, { reason: 'Redis client not configured' }),
        );
      }
      await client.ping();
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError('Redis health check failed', error as Error);
    }
  }
}

