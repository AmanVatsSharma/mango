/**
 * @file src/modules/support/support.module.ts
 * @module support
 * @description Support module scaffold
 * @author BharatERP
 * @created 2026-02-19
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { SupportController } from './controllers/support.controller';
import { SupportCommentEntity } from './entities/support-comment.entity';
import { SupportTicketEntity } from './entities/support-ticket.entity';
import { SupportService } from './services/support.service';
import { SupportResolver } from './support.resolver';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    SharedModule,
    RbacModule,
    TypeOrmModule.forFeature([SupportTicketEntity, SupportCommentEntity]),
  ],
  controllers: [SupportController],
  providers: [SupportService, SupportResolver],
  exports: [SupportService],
})
export class SupportModule {}
