/**
 * File:        apps/backend/src/shared/audit/audit.module.ts
 * Module:      shared/audit
 * Purpose:     Global @Module that registers AuditService so any module can inject
 *              it without explicit import. Mirrors the SharedModule pattern.
 *
 * Exports:     AuditService, AuditLogEntity
 * Side-effects: registers audit_logs table via TypeORM autoLoadEntities
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from './audit-log.entity';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  providers: [AuditService],
  exports: [AuditService, TypeOrmModule],
})
export class AuditModule {}
