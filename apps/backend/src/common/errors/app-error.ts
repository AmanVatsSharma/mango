/**
 * @file src/common/errors/app-error.ts
 * @module common-errors
 * @description Base AppError and domain error codes
 * @author BharatERP
 * @created 2025-09-18
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'DUPLICATE_RESOURCE'
  | 'INTERNAL_ERROR'
  | 'ORDER_VALIDATION'
  | 'INSUFFICIENT_MARGIN'
  | 'EXCHANGE_DOWN'
  | 'DUPLICATE_ORDER'
  | 'DEMO_ACCOUNT_OPERATION'
  | 'RISK_LIMIT_BREACH'
  | 'COMPLIANCE_BREACH'
  | 'EXCHANGE_NOT_ENABLED';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationAppError extends AppError {
  constructor(message: string, cause?: unknown) {
    super('VALIDATION_ERROR', message, cause);
  }
}
