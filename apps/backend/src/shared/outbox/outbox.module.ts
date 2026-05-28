/**
 * @file src/shared/outbox/outbox.module.ts
 * @module shared/outbox
 * @description Nest module for outbox entity, service, and worker
 * @author BharatERP
 * @created 2026-02-19
 */

import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEntity } from './entities/outbox.entity';
import { OutboxService } from './outbox.service';
import { OutboxWorkerSkeleton } from './outbox-worker.skeleton';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEntity])],
  providers: [OutboxService, OutboxWorkerSkeleton],
  exports: [OutboxService],
})
export class OutboxModule {}
