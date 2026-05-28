/**
 * File:        apps/backend/src/modules/crm/controllers/crm.controller.ts
 * Module:      crm
 * Purpose:     Admin REST endpoints for Retention CRM
 *
 * Exports:
 *   - CrmController — @Controller('admin/crm')
 *       GET    /admin/crm/clients          — list CRM client records
 *       POST   /admin/crm/outreach         — send outreach communication
 *       GET    /admin/crm/churn-risk       — churn risk scores
 *       POST   /admin/crm/retention/offers — create retention offer
 *
 * Depends on:
 *   - CrmService — CRM operations
 *
 * Side-effects:
 *   - DB writes via service
 *
 * Key invariants:
 *   - All endpoints require JwtAuthGuard + TenantGuard + PermissionsGuard('oms:admin')
 *
 * Read order:
 *   1. CrmController — all endpoints
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { Tenant } from '../../rbac/decorators/tenant.decorator';
import { CrmService } from '../services/crm.service';
import { CreateCrmOutreachDto } from '../dtos/create-crm-outreach.dto';
import { CreateRetentionOfferDto } from '../dtos/create-retention-offer.dto';
import { CrmOutreachEntity } from '../entities/crm-outreach.entity';
import { CrmRetentionOfferEntity } from '../entities/crm-retention-offer.entity';

@Controller('admin/crm')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get('clients')
  @Permissions('oms:admin')
  async listClients(@Tenant() tenantId: string): Promise<CrmOutreachEntity[]> {
    return this.crmService.listClients(tenantId);
  }

  @Post('outreach')
  @Permissions('oms:admin')
  async sendOutreach(@Body() dto: CreateCrmOutreachDto): Promise<CrmOutreachEntity> {
    return this.crmService.sendOutreach(dto);
  }

  @Get('churn-risk')
  @Permissions('oms:admin')
  async getChurnRisk(@Tenant() tenantId: string): Promise<{ userId: string; riskScore: number }[]> {
    return this.crmService.getChurnRiskScores(tenantId);
  }

  @Post('retention/offers')
  @Permissions('oms:admin')
  async createRetentionOffer(@Body() dto: CreateRetentionOfferDto): Promise<CrmRetentionOfferEntity> {
    return this.crmService.createRetentionOffer(dto);
  }
}