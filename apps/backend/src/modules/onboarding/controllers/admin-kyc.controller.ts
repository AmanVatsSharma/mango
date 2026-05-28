/**
 * File:        apps/backend/src/modules/onboarding/controllers/admin-kyc.controller.ts
 * Module:      onboarding · Admin KYC
 * Purpose:     Broker admin endpoints for reviewing KYC documents — list all pending
 *              documents across the tenant, approve or reject individual documents.
 *
 * Exports:
 *   - AdminKycController — NestJS controller with 3 endpoints
 *
 * Depends on:
 *   - ../services/kyc-document.service   — KycDocumentService.listAll, .reviewDocument
 *   - AppLoggerService                  — structured request logging
 *   - JwtAuthGuard + TenantGuard + PermissionsGuard
 *
 * Side-effects:
 *   - Outbox event emitted on document approval/rejection (via KycDocumentService)
 *
 * Key invariants:
 *   - All endpoints require JwtAuthGuard + TenantGuard (tenant-scoped) + PermissionsGuard
 *   - reviewDocument uses the same state machine as user-facing review — enforces
 *     PENDING_REVIEW → APPROVED | REJECTED transitions only
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { KycDocumentService } from '../services/kyc-document.service';
import { ReviewKycDocumentDto } from '../dtos/kyc-document.dto';
import { AppLoggerService } from '../../../shared/logger';

@ApiTags('admin/kyc')
@Controller('admin/kyc/documents')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminKycController {
  constructor(
    private readonly kycService: KycDocumentService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminKycController.name);
  }

  @Get()
  @Permissions('kyc:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all KYC documents for the tenant with optional filters' })
  @ApiQuery({ name: 'status', required: false, description: 'PENDING_REVIEW | APPROVED | REJECTED' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user UUID' })
  @ApiQuery({ name: 'documentType', required: false, description: 'PASSPORT | NATIONAL_ID | DRIVERS_LICENSE | UTILITY_BILL | BANK_STATEMENT' })
  @ApiQuery({ name: 'limit', required: false, example: '50' })
  @ApiQuery({ name: 'offset', required: false, example: '0' })
  @ApiResponse({ status: 200, description: 'Paginated KYC document list' })
  async listAll(
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('documentType') documentType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.logger.debug('GET /admin/kyc/documents', { status, userId, documentType, limit, offset });
    return this.kycService.listAll({
      status: status as any,
      userId,
      documentType: documentType as any,
      limit: limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Post(':id/approve')
  @Permissions('kyc:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Approve a KYC document — advances state to APPROVED' })
  @ApiParam({ name: 'id', type: String, description: 'KYC document UUID' })
  @ApiResponse({ status: 200, description: 'Approved document' })
  async approve(@Param('id') id: string, @Req() req: Request) {
    this.logger.debug('POST /admin/kyc/documents/:id/approve', { id });
    const reviewerId = (req.user as any)?.id ?? 'system';
    return this.kycService.reviewDocument(id, { decision: 'APPROVED' }, reviewerId);
  }

  @Post(':id/reject')
  @Permissions('kyc:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Reject a KYC document with optional reason' })
  @ApiParam({ name: 'id', type: String, description: 'KYC document UUID' })
  @ApiResponse({ status: 200, description: 'Rejected document' })
  async reject(
    @Param('id') id: string,
    @Body() dto: { rejectionReason?: string },
    @Req() req: Request,
  ) {
    this.logger.debug('POST /admin/kyc/documents/:id/reject', { id, rejectionReason: dto.rejectionReason });
    const reviewerId = (req.user as any)?.id ?? 'system';
    return this.kycService.reviewDocument(id, {
      decision: 'REJECTED',
      rejectionReason: dto.rejectionReason,
    }, reviewerId);
  }
}