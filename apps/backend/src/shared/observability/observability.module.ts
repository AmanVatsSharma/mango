/**
 * @file src/shared/observability/observability.module.ts
 * @module shared-observability
 * @description Provides metrics (Prometheus) and health checks (Terminus)
 * @author BharatERP
 * @created 2025-01-09
 */

import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './controllers/health.controller';
import { MetricsController } from './controllers/metrics.controller';
import { PromClientService } from './services/prom-client.service';
import { RedisHealthIndicator } from './services/redis-health.indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController, MetricsController],
  providers: [PromClientService, RedisHealthIndicator],
  exports: [PromClientService],
})
export class ObservabilityModule {}

