/**
 * File:        apps/backend/src/modules/reports/reports.module.ts
 * Module:      reports
 * Purpose:     Report Builder module — parameterized report definitions and execution
 *
 * Exports:
 *   - ReportsService — report management
 *
 * Depends on:
 *   - SharedModule    — AppLoggerService
 *   - AuthModule     — JwtAuthGuard
 *   - RbacModule     — TenantGuard, PermissionsGuard, Permissions, Tenant
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
import { ReportDefinitionEntity } from './entities/report-definition.entity';
import { ReportsService } from './services/reports.service';
import { ReportsController } from './controllers/reports.controller';
import { ReportsResolver } from './reports.resolver';

@Module({
  imports: [
    SharedModule,
    AuthModule,
    RbacModule,
    TypeOrmModule.forFeature([ReportDefinitionEntity]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsResolver],
  exports: [ReportsService],
})
export class ReportsModule {}