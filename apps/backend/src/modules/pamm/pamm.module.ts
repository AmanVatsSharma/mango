/**
 * File:        apps/backend/src/modules/pamm/pamm.module.ts
 * Module:      pamm
 * Purpose:     PAMM (Percentage Allocation Management Module) — strategy masters and slave allocations
 *
 * Exports:
 *   - PammService — PAMM CRUD
 *
 * Depends on:
 *   - SharedModule     — AppLoggerService
 *   - AuthModule      — JwtAuthGuard
 *   - RbacModule      — TenantGuard, PermissionsGuard, Permissions, Tenant
 *
 * Side-effects:  none
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. @Module declaration
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '@obsidian/backend-shared';
import { AuthModule } from '@obsidian/backend-auth';
import { RbacModule } from '@obsidian/backend-rbac';
import { PamMMasterEntity } from './entities/pamm-master.entity';
import { PamMSlaveEntity } from './entities/pamm-slave.entity';
import { PammService } from './services/pamm.service';
import { PamMController } from './controllers/pamm.controller';
import { PammResolver } from './pamm.resolver';

@Module({
  imports: [
    SharedModule,
    AuthModule,
    RbacModule,
    TypeOrmModule.forFeature([PamMMasterEntity, PamMSlaveEntity]),
  ],
  controllers: [PamMController],
  providers: [PammService, PammResolver],
  exports: [PammService],
})
export class PammModule {}