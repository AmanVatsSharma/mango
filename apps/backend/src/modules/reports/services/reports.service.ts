/**
 * File:        apps/backend/src/modules/reports/services/reports.service.ts
 * Module:      reports
 * Purpose:     Report builder service — definition CRUD and execution
 *
 * Exports:
 *   - ReportsService — report management
 *
 * Depends on:
 *   - ReportDefinitionEntity — report entity
 *   - AppLoggerService       — structured logging
 *
 * Side-effects:  DB writes only
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. Definition CRUD — createReport, listReports
 *   2. Execution — executeReport
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '@obsidian/backend-shared';
import { AppError } from '@obsidian/backend-common';
import { ReportDefinitionEntity } from '../entities/report-definition.entity';
import { CreateReportDefinitionDto } from '../dtos/create-report-definition.dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(ReportDefinitionEntity)
    private readonly reports: Repository<ReportDefinitionEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(ReportsService.name);
  }

  async createReport(dto: CreateReportDefinitionDto): Promise<ReportDefinitionEntity> {
    this.logger.debug('createReport:start', dto);
    const saved = await this.reports.save(this.reports.create(dto));
    this.logger.debug('createReport:end', { reportId: saved.id });
    return saved;
  }

  async listReports(tenantId: string): Promise<ReportDefinitionEntity[]> {
    this.logger.debug('listReports:start', { tenantId });
    return this.reports.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async executeReport(id: string): Promise<{ data: Record<string, unknown>[] }> {
    this.logger.debug('executeReport:start', { id });

    const report = await this.reports.findOne({ where: { id } });
    if (!report) {
      throw new AppError('RESOURCE_NOT_FOUND', `Report ${id} not found`);
    }

    // Update lastRunAt
    report.lastRunAt = new Date();
    await this.reports.save(report);

    // Stubbed — real implementation would build and execute a dynamic query
    this.logger.debug('executeReport:end', { reportId: id });
    return { data: [] };
  }
}