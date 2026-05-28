/**
 * @file src/modules/accounts/controllers/admin-deposits.controller.ts
 * @module accounts
 * @description Admin endpoints to review and approve deposit requests
 * @author BharatERP
 * @created 2025-01-09
 */

import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { DepositsService } from '../services/deposits.service';
import { AppLoggerService } from '../../../shared/logger';

@ApiTags('admin/accounts')
@Controller('admin/accounts/deposits')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AdminDepositsController {
  constructor(
    private readonly service: DepositsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminDepositsController.name);
  }

  @Get()
  @Permissions('accounts:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all deposit requests for tenant' })
  @ApiResponse({ status: 200, description: 'Deposit requests' })
  async listAll() {
    this.logger.debug('GET /admin/accounts/deposits');
    return this.service.listAllAdmin();
  }

  @Post(':id/approve')
  @Permissions('accounts:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Approve a deposit request and credit ledger' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Approved deposit' })
  async approve(@Param('id') id: string, @Body('reason') _reason: string, @Req() req: any) {
    this.logger.debug('POST /admin/accounts/deposits/:id/approve', { id, admin: req?.user?.userId });
    return this.service.approve(id, req.user.userId);
  }

  @Post(':id/reject')
  @Permissions('accounts:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Reject a deposit request' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Rejected deposit' })
  async reject(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    this.logger.debug('POST /admin/accounts/deposits/:id/reject', { id, admin: req?.user?.userId });
    return this.service.reject(id, req.user.userId, reason);
  }
}

