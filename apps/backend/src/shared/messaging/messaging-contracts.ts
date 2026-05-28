/**
 * @file src/shared/messaging/contracts.ts
 * @module shared/messaging
 * @description Messaging contracts and type definitions for publisher/consumer
 * @author BharatERP
 * @created 2026-02-19
 */

/**
 * Base envelope for all outbound messages.
 */
export interface MessageEnvelope<T = unknown> {
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Tenant ID for multi-tenancy */
  tenantId?: string;
  /** Message timestamp (ISO 8601) */
  timestamp: string;
  /** Message payload */
  payload: T;
  /** Schema version for evolution */
  schemaVersion?: number;
}

/**
 * Publish options for message publishers.
 */
export interface PublishOptions {
  /** Optional topic/queue override */
  topic?: string;
  /** Optional partition key for ordering */
  partitionKey?: string;
  /** Optional delay in seconds */
  delaySeconds?: number;
}

/**
 * Consumer handler result type.
 */
export type ConsumerResult = void | Promise<void>;
