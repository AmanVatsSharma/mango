/**
 * @file src/modules/accounts/controllers/deposits.controller.ts
 * @module accounts
 * @description Deposit request endpoints for users (create/list) and admin approvals
 * @author BharatERP
 * @created 2025-01-09
 */

import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { DepositsService } from '../services/deposits.service';
import { CreateDepositRequestDto } from '../dtos/create-deposit-request.dto';
import { AppLoggerService } from '../../../shared/logger';

@ApiTags('Accounts')
@Controller('accounts/deposits')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class DepositsController {
  constructor(
    private readonly service: DepositsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(DepositsController.name);
  }

  @Post()
  @Permissions('accounts:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Request a deposit', description: 'Creates a deposit request pending admin approval' })
  @ApiBody({ type: CreateDepositRequestDto })
  @ApiResponse({ status: 201, description: 'Deposit request created' })
  async request(@Body() dto: CreateDepositRequestDto, @Req() req: any) {
    this.logger.debug('POST /accounts/deposits', { userId: req.user.userId });
    return this.service.requestDeposit(dto, req.user.userId);
  }

  @Get()
  @Permissions('accounts:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List my deposit requests' })
  @ApiResponse({ status: 200, description: 'Deposit requests' })
  async listMine(@Req() req: any) {
    this.logger.debug('GET /accounts/deposits', { userId: req.user.userId });
    return this.service.listMine(req.user.userId);
  }
}

