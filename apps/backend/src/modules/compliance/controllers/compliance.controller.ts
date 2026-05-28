/**
 * @file src/modules/compliance/controllers/compliance.controller.ts
 * @module compliance
 * @description Controller for jurisdiction compliance policy assignment and retrieval
 * @author BharatERP
 * @created 2026-02-17
 */

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { UpsertCompliancePolicyDto } from '../dtos/upsert-compliance-policy.dto';
import { CompliancePolicyEntity } from '../entities/compliance-policy.entity';
import { ComplianceService } from '../services/compliance.service';

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Post('policies')
  async upsert(@Body() dto: UpsertCompliancePolicyDto): Promise<CompliancePolicyEntity> {
    return this.complianceService.upsertPolicy(dto);
  }

  @Get('policies')
  async list(@Query('tenantId') tenantId: string): Promise<CompliancePolicyEntity[]> {
    return this.complianceService.listPolicies(tenantId);
  }
}
