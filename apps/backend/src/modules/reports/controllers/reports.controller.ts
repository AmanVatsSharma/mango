/**
 * File:        apps/backend/src/modules/reports/controllers/reports.controller.ts
 * Module:      reports
 * Purpose:     Admin REST endpoints for Report Builder
 *
 * Exports:
 *   - ReportsController — @Controller('admin/reports')
 *       GET    /admin/reports/builder     — list report definitions
 *       POST   /admin/reports             — create report definition
 *       GET    /admin/reports/:id/download — execute and download
 *
 * Depends on:
 *   - ReportsService — report management
 *
 * Side-effects:
 *   - DB writes via service
 *
 * Key invariants:
 *   - All endpoints require JwtAuthGuard + TenantGuard + PermissionsGuard('oms:admin')
 *
 * Read order:
 *   1. ReportsController — all endpoints
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { ReportsService } from '../services/reports.service';
import { CreateReportDefinitionDto } from '../dtos/create-report-definition.dto';
import { ReportDefinitionEntity } from '../entities/report-definition.entity';

@Controller('admin/reports')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('builder')
  @Permissions('oms:admin')
  async listReports(@Tenant() tenantId: string): Promise<ReportDefinitionEntity[]> {
    return this.reportsService.listReports(tenantId);
  }

  @Post()
  @Permissions('oms:admin')
  async createReport(@Body() dto: CreateReportDefinitionDto): Promise<ReportDefinitionEntity> {
    return this.reportsService.createReport(dto);
  }

  @Get(':id/download')
  @Permissions('oms:admin')
  async downloadReport(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.reportsService.executeReport(id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="report-${id}.json"`);
    res.json(result);
  }
}