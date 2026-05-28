/**
 * @file src/common/filters/http-exception.filter.ts
 * @module common-filters
 * @description Maps AppError and generic errors to structured HTTP responses with requestId
 * @author BharatERP
 * @created 2025-09-18
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLoggerService } from '../../shared/logger';
import { AppError } from '../errors/app-error';
import { getRequestContext } from '../../shared/request-context';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const reqCtx = getRequestContext();

    const { status, body } = this.mapException(exception);

    // Always log error with stack and requestId
    const stack = exception instanceof Error ? exception.stack : undefined;
    this.logger.error('Unhandled error', stack, 'GlobalHttpExceptionFilter');

    response.status(status).json({
      ...body,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId: reqCtx?.requestId,
    });
  }

  private mapException(exception: unknown): { status: number; body: any } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      return {
        status,
        body: typeof response === 'string' ? { message: response } : response,
      };
    }

    if (exception instanceof AppError) {
      const status = this.statusForAppError(exception);
      return {
        status,
        body: {
          code: exception.code,
          message: exception.message,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    };
  }

  private statusForAppError(err: AppError): number {
    switch (err.code) {
      case 'VALIDATION_ERROR':
        return HttpStatus.BAD_REQUEST;
      case 'AUTHENTICATION_FAILED':
        return HttpStatus.UNAUTHORIZED;
      case 'AUTHORIZATION_FAILED':
        return HttpStatus.FORBIDDEN;
      case 'RESOURCE_NOT_FOUND':
        return HttpStatus.NOT_FOUND;
      case 'DUPLICATE_RESOURCE':
        return HttpStatus.CONFLICT;
      case 'ORDER_VALIDATION':
        return HttpStatus.BAD_REQUEST;
      case 'INSUFFICIENT_MARGIN':
        return HttpStatus.PAYMENT_REQUIRED;
      case 'EXCHANGE_DOWN':
        return HttpStatus.SERVICE_UNAVAILABLE;
      case 'DUPLICATE_ORDER':
        return HttpStatus.CONFLICT;
      case 'DEMO_ACCOUNT_OPERATION':
        return HttpStatus.FORBIDDEN;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }
}
