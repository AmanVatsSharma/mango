/**
 * File:        apps/backend/src/modules/tenancy/controllers/domains.controller.ts
 * Module:      tenancy
 * Purpose:     REST controller for tenant custom domain management. Supports
 *              listing, adding, removing, promoting domains and checking their
 *              DNS verification and SSL status.
 *
 * Exports:
 *   - DomainsController   — NestJS REST controller
 *
 * Depends on:
 *   - TenancyService         — domain CRUD and health checks
 *   - BrokerAdminGuard      — broker-scoped auth guard
 *   - JwtAuthGuard          — JWT authentication
 *   - AddDomainDto          — input validation
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - All endpoints require BrokerAdminGuard — tenant-scoped admin access.
 *   - verifyDns and getSslStatus are GET (no body) for easy browser / curl testing.
 *
 * Read order:
 *   1. DomainsController — route definitions
 *   2. TenancyService    — implementation details
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BrokerAdminGuard } from '../../rbac/guards/broker-admin.guard';
import { AddDomainDto } from '../dtos/add-domain.dto';
import { TenantDomainEntity } from '../entities/tenant-domain.entity';
import { TenancyService } from '../services/tenancy.service';

type BrokerAdminRequest = Request & { tenantId?: string };

@ApiTags('Tenancy — Domains')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, BrokerAdminGuard)
@Controller('tenancy/domains')
export class DomainsController {
  constructor(private readonly tenancyService: TenancyService) {}

  @Get()
  @ApiOperation({ summary: 'List all custom domains for the authenticated tenant' })
  @ApiResponse({ status: 200, description: 'List of domains', type: [TenantDomainEntity] })
  async listDomains(@Req() req: BrokerAdminRequest): Promise<TenantDomainEntity[]> {
    return this.tenancyService.listDomains(req.tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Register a new custom domain for the authenticated tenant' })
  @ApiResponse({ status: 201, description: 'Domain registered', type: TenantDomainEntity })
  async addDomain(
    @Req() req: BrokerAdminRequest,
    @Body() dto: AddDomainDto,
  ): Promise<TenantDomainEntity> {
    return this.tenancyService.addDomain(req.tenantId, dto.domain);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a domain registration' })
  @ApiResponse({ status: 200, description: 'Domain removed' })
  async removeDomain(@Req() req: BrokerAdminRequest, @Param('id') id: string): Promise<{ message: string }> {
    await this.tenancyService.removeDomain(id);
    return { message: 'Domain removed' };
  }

  @Post(':id/set-primary')
  @ApiOperation({ summary: 'Promote a domain as the primary (main) domain for the tenant' })
  @ApiResponse({ status: 200, description: 'Domain promoted to primary', type: TenantDomainEntity })
  async setPrimaryDomain(
    @Req() req: BrokerAdminRequest,
    @Param('id') id: string,
  ): Promise<TenantDomainEntity> {
    return this.tenancyService.setPrimaryDomain(id, req.tenantId);
  }

  @Get('verify/:domain')
  @ApiOperation({ summary: 'Check DNS verification status for a domain' })
  @ApiResponse({ status: 200, description: 'DNS verification result' })
  async verifyDns(
    @Param('domain') domain: string,
  ): Promise<{ verified: boolean; recordType: string; expectedValue: string }> {
    return this.tenancyService.verifyDomainDns(domain);
  }

  @Get('ssl/:domain')
  @ApiOperation({ summary: 'Check SSL/TLS activation status for a domain' })
  @ApiResponse({ status: 200, description: 'SSL status result' })
  async getSslStatus(
    @Param('domain') domain: string,
  ): Promise<{ active: boolean; expiry: string | null; issuer: string | null }> {
    return this.tenancyService.getDomainSslStatus(domain);
  }
}