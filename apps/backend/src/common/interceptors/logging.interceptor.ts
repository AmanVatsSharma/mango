/**
 * @file src/common/interceptors/logging.interceptor.ts
 * @module common-interceptors
 * @description Logs request/response lifecycle with requestId and duration
 * @author BharatERP
 * @created 2025-09-18
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AppLoggerService } from '../../shared/logger';
import { getRequestContext } from '../../shared/request-context';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    const req = context.switchToHttp().getRequest();
    const reqCtx = getRequestContext();
    this.logger.debug(`Incoming ${req.method} ${req.url}`, {
      reqId: reqCtx?.requestId,
    });
    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - now;
        this.logger.debug(`Completed ${req.method} ${req.url} in ${ms}ms`, {
          reqId: reqCtx?.requestId,
        });
      }),
    );
  }
}
