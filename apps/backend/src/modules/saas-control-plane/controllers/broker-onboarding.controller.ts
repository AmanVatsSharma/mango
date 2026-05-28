/**
 * File:        apps/backend/src/modules/saas-control-plane/controllers/broker-onboarding.controller.ts
 * Module:      saas-control-plane
 * Purpose:     Platform Owner REST endpoints for broker lifecycle management,
 *              platform stats, revenue, health, billing, entitlements, and Phase 2 pages.
 *
 * Exports:
 *   - BrokerOnboardingController — @Controller('saas')
 *
 * Depends on:
 *   - BrokerOnboardingService  — all business logic
 *   - JwtAuthGuard             — validates access token
 *   - PlatformOwnerGuard        — enforces tid='platform' + platform_owner role
 *
 * Side-effects:  DB writes + optional SMS + outbox event (via BrokerOnboardingService)
 *
 * Key invariants:
 *   - Every endpoint is platform-owner gated — no public routes here.
 *   - requestedBy is set from the authenticated user's ID (req.user.userId).
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-11
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PlatformOwnerGuard } from '../../rbac/guards/platform-owner.guard';
import { OnboardBrokerDto } from '../dtos/onboard-broker.dto';
import { BrokerOnboardingService } from '../services/broker-onboarding.service';

@UseGuards(JwtAuthGuard, PlatformOwnerGuard)
@Controller('saas')
export class BrokerOnboardingController {
  constructor(private readonly service: BrokerOnboardingService) {}

  // Platform-level stats

  @Get('stats')
  async getPlatformStats() {
    return this.service.getPlatformStats();
  }

  @Get('revenue-series')
  async getRevenueSeries() {
    return this.service.getRevenueSeries(12);
  }

  @Get('revenue/plan-breakdown')
  async getPlanRevenueBreakdown() {
    return this.service.getPlanRevenueBreakdown();
  }

  @Get('health')
  async getPlatformHealth() {
    return this.service.getPlatformHealth();
  }

  // Live activity (Phase 2)

  @Get('activity')
  async getLiveActivity() {
    return this.service.getLiveActivity(50);
  }

  // Billing

  @Get('billing/invoices')
  async listAllBilling() {
    return this.service.listAllBilling();
  }

  @Post('billing/invoices')
  async createBilling(
    @Body() dto: { tenantId: string; invoiceNumber: string; amount: string; currency: string; idempotencyKey?: string },
  ) {
    return this.service.createBillingPlaceholder(dto);
  }

  // Entitlements

  @Get('entitlements')
  async listAllEntitlements() {
    return this.service.listAllEntitlements();
  }

  @Post('entitlements')
  async upsertEntitlements(
    @Body() dto: { tenantId: string; planCode: string; entitlements: Record<string, unknown>; featureFlags: Record<string, boolean> },
  ) {
    return this.service.upsertEntitlementsForTenant(dto);
  }

  // Audit

  @Get('audit/impersonations')
  async listAllAudit() {
    return this.service.listAllAudit();
  }

  // Onboarding queue (Phase 2)

  @Get('onboarding/queue')
  async listPendingOnboarding() {
    return this.service.listPendingOnboarding();
  }

  @Post('onboarding/:tenantId/advance')
  @HttpCode(204)
  async advanceProvisioning(@Param('tenantId') tenantId: string): Promise<void> {
    // Service returns TenantProvisioningEntity but 204 has no body — discard it
    await this.service.advanceProvisioning(tenantId);
  }

  // Suspended brokers (Phase 2)

  @Get('suspended')
  async listSuspendedBrokers() {
    return this.service.listSuspendedBrokers();
  }

  @Post('suspended/:tenantCode/reactivate')
  async reactivateBroker(@Param('tenantCode') tenantCode: string) {
    return this.service.reactivateBroker(tenantCode);
  }

  // Broker lifecycle (existing)

  @Post('onboard-broker')
  async onboardBroker(
    @Body() dto: OnboardBrokerDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.service.onboardBroker(dto, req.user.userId);
  }

  @Get('brokers')
  async listBrokers() {
    return this.service.listBrokers();
  }

  @Get('brokers/:tenantCode')
  async getBroker(@Param('tenantCode') tenantCode: string) {
    return this.service.getBroker(tenantCode);
  }

  @Get('brokers/:tenantCode/metrics')
  async getBrokerMetrics(@Param('tenantCode') tenantCode: string) {
    return this.service.getBrokerMetrics(tenantCode);
  }

  @Get('brokers/metrics')
  async listBrokersWithMetrics() {
    return this.service.listBrokersWithMetrics();
  }

  @Post('brokers/:tenantCode/suspend')
  @HttpCode(204)
  async suspendBroker(
    @Param('tenantCode') tenantCode: string,
    @Body('reason') reason?: string,
  ): Promise<void> {
    await this.service.suspendBroker(tenantCode, reason);
  }
}
