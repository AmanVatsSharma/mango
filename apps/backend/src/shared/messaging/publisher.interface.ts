/**
 * @file src/shared/messaging/publisher.interface.ts
 * @module shared/messaging
 * @description Messaging publisher interface contract
 * @author BharatERP
 * @created 2026-02-19
 */

import { MessageEnvelope, PublishOptions } from './messaging-contracts';

/**
 * Publisher interface for async message publishing.
 */
export interface IMessagePublisher {
  /**
   * Publish a message to the configured topic/queue.
   */
  publish<T>(topic: string, payload: MessageEnvelope<T>, options?: PublishOptions): Promise<void>;

  /**
   * Publish a batch of messages.
   */
  publishBatch<T>(
    topic: string,
    payloads: MessageEnvelope<T>[],
    options?: PublishOptions,
  ): Promise<void>;
}
