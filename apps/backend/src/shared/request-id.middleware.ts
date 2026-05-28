/**
 * @file src/shared/request-id.middleware.ts
 * @module shared
 * @description Middleware to attach requestId and tenantId to each request and AsyncLocalStorage
 * @author BharatERP
 * @created 2025-09-18
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { PromClientService } from './observability/services/prom-client.service';
import { randomUUID } from 'node:crypto';
import {
  REQUEST_ID_HEADER,
  TENANT_ID_HEADER,
  withRequestContext,
} from './request-context';

function generateId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly prom?: PromClientService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const headerRequestId = (req.headers[REQUEST_ID_HEADER] as string) || '';
    const requestId =
      headerRequestId && headerRequestId.trim().length > 0
        ? headerRequestId
        : generateId();

    let tenantIdHeader = (req.headers[TENANT_ID_HEADER] as string) || undefined;
    if (!tenantIdHeader) {
      // Fallback: extract first subdomain as tenant (e.g., tenant.example.com)
      const host = req.headers['host'];
      if (host && host.includes('.')) {
        tenantIdHeader = host.split('.')[0];
      }
    }

    // Expose request id back to client for correlation
    res.setHeader(REQUEST_ID_HEADER, requestId);

    // Bind ALS context for the lifetime of this request
    const started = Date.now();
    withRequestContext(
      {
        requestId,
        tenantId: tenantIdHeader ?? null,
        userId: null,
      },
      () => {
        res.on('finish', () => {
          if (this.prom) {
            const routePath = req.route?.path || req.originalUrl || 'unknown';
            this.prom.httpRequestDuration
              .labels(req.method, routePath, String(res.statusCode))
              .observe(Date.now() - started);
            if (res.statusCode >= 500) {
              this.prom.httpRequestErrors
                .labels(req.method, routePath, String(res.statusCode))
                .inc();
            }
          }
        });
        next();
      },
    );
  }
}
