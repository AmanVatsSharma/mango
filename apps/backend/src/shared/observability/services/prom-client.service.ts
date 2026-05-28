/**
 * @file src/shared/observability/services/prom-client.service.ts
 * @module shared-observability
 * @description Prometheus metrics registry and common metrics
 * @author BharatERP
 * @created 2025-01-09
 */

import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

@Injectable()
export class PromClientService {
  private readonly registry: Registry;
  readonly httpRequestDuration: Histogram<string>;
  readonly httpRequestErrors: Counter<string>;
  readonly dbPoolGauge: Gauge<string>;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_ms',
      help: 'HTTP request duration in ms',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [50, 100, 200, 400, 800, 1600, 3200],
      registers: [this.registry],
    });

    this.httpRequestErrors = new Counter({
      name: 'http_request_errors_total',
      help: 'Total HTTP errors',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.dbPoolGauge = new Gauge({
      name: 'db_pool_connections',
      help: 'Database pool connections (placeholder)',
      labelNames: ['pool'],
      registers: [this.registry],
    });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}

