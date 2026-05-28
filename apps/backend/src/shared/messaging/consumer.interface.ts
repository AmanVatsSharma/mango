/**
 * @file src/shared/messaging/consumer.interface.ts
 * @module shared/messaging
 * @description Messaging consumer interface contract
 * @author BharatERP
 * @created 2026-02-19
 */

import { MessageEnvelope } from './messaging-contracts';

/**
 * Consumer handler signature.
 */
export type ConsumerHandler<T = unknown> = (payload: MessageEnvelope<T>) => Promise<void>;

/**
 * Consumer interface for async message consumption.
 */
export interface IMessageConsumer {
  /**
   * Subscribe to a topic with a handler.
   */
  subscribe<T>(topic: string, handler: ConsumerHandler<T>): Promise<void>;

  /**
   * Unsubscribe from a topic.
   */
  unsubscribe(topic: string): Promise<void>;

  /**
   * Start consuming messages.
   */
  start(): Promise<void>;

  /**
   * Stop consuming messages.
   */
  stop(): Promise<void>;
}
