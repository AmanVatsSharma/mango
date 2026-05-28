/**
 * @file src/shared/observability/controllers/metrics.controller.ts
 * @module shared-observability
 * @description Exposes Prometheus metrics
 * @author BharatERP
 * @created 2025-01-09
 */

import { Controller, Get, Res } from '@nestjs/common';
import { PromClientService } from '../services/prom-client.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly prom: PromClientService) {}

  @Get()
  async metrics(@Res() res: any) {
    res.setHeader('Content-Type', this.prom.contentType);
    res.end(await this.prom.metrics());
  }
}

