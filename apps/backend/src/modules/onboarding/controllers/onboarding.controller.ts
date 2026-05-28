/**
 * File:        apps/backend/src/modules/onboarding/controllers/onboarding.controller.ts
 * Module:      onboarding
 * Purpose:     Broker admin onboarding profile management — upsert and list profiles
 *              for tenant-scoped users.
 *
 * Exports:
 *   - OnboardingController — @Controller('onboarding')
 *       POST /onboarding/profiles — upsert an onboarding profile
 *       GET  /onboarding/profiles — list profiles for a tenant
 *
 * Depends on:
 *   - OnboardingService — profile upsert and list logic
 *
 * Side-effects: DB writes for POST
 *
 * Key invariants:
 *   - All endpoints require JwtAuthGuard + TenantGuard (tenant-scoped)
 *   - TenantGuard extracts tenantId from the authenticated JWT context
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UpsertOnboardingProfileDto } from '../dtos/upsert-onboarding-profile.dto';
import { OnboardingProfileEntity } from '../entities/onboarding-profile.entity';
import { OnboardingService } from '../services/onboarding.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';

@ApiTags('onboarding')
@Controller('onboarding')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth('JWT')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('profiles')
  @ApiOperation({ summary: 'Upsert an onboarding profile for the tenant' })
  async upsert(@Body() dto: UpsertOnboardingProfileDto): Promise<OnboardingProfileEntity> {
    return this.onboardingService.upsertProfile(dto);
  }

  @Get('profiles')
  @ApiOperation({ summary: 'List onboarding profiles for a tenant' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant UUID (auto-filled from auth context)' })
  async list(@Query('tenantId') tenantId: string): Promise<OnboardingProfileEntity[]> {
    return this.onboardingService.listProfiles(tenantId);
  }
}
