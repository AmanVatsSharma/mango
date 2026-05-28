/**
 * @file src/common/errors/domain.errors.ts
 * @module common-errors
 * @description Domain error classes for trading flows
 * @author BharatERP
 * @created 2025-09-18
 */

import { AppError } from './app-error';

export class OrderValidationError extends AppError {
  constructor(message = 'Order validation failed', cause?: unknown) {
    super('ORDER_VALIDATION', message, cause);
  }
}

export class InsufficientMarginError extends AppError {
  constructor(message = 'Insufficient margin to place order', cause?: unknown) {
    super('INSUFFICIENT_MARGIN', message, cause);
  }
}

export class ExchangeDownError extends AppError {
  constructor(message = 'Upstream exchange is unavailable', cause?: unknown) {
    super('EXCHANGE_DOWN', message, cause);
  }
}

export class DuplicateOrderError extends AppError {
  constructor(message = 'Duplicate order detected', cause?: unknown) {
    super('DUPLICATE_ORDER', message, cause);
  }
}

export class UserNotFoundError extends AppError {
  constructor(message = 'User not found', cause?: unknown) {
    super('RESOURCE_NOT_FOUND', message, cause);
  }
}

export class DuplicateUserError extends AppError {
  constructor(message = 'User already exists', cause?: unknown) {
    super('DUPLICATE_RESOURCE', message, cause);
  }
}

/** Operation not allowed for demo accounts (e.g. real deposits/withdrawals). */
export class DemoAccountOperationError extends AppError {
  constructor(message = 'This operation is not allowed for demo accounts', cause?: unknown) {
    super('DEMO_ACCOUNT_OPERATION', message, cause);
  }
}
