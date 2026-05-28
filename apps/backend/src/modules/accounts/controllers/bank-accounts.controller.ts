/**
 * @file src/modules/accounts/controllers/bank-accounts.controller.ts
 * @module accounts
 * @description Bank accounts linking and listing endpoints for funding flows
 * @author BharatERP
 * @created 2025-01-09
 */

import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { BankAccountsService } from '../services/bank-accounts.service';
import { CreateBankAccountDto } from '../dtos/create-bank-account.dto';
import { AppLoggerService } from '../../../shared/logger';

@ApiTags('Accounts')
@Controller('accounts/bank-accounts')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class BankAccountsController {
  constructor(
    private readonly service: BankAccountsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(BankAccountsController.name);
  }

  @Post()
  @Permissions('accounts:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Link a bank account', description: 'Links a bank account to the authenticated user (and optional trading account).' })
  @ApiBody({ type: CreateBankAccountDto })
  @ApiResponse({ status: 201, description: 'Bank account linked' })
  async link(@Body() dto: CreateBankAccountDto, @Req() req: any) {
    this.logger.debug('POST /accounts/bank-accounts', { userId: req.user.userId });
    return this.service.create(dto, req.user.userId);
  }

  @Get()
  @Permissions('accounts:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List linked bank accounts' })
  @ApiResponse({ status: 200, description: 'List of bank accounts' })
  async list(@Req() req: any) {
    this.logger.debug('GET /accounts/bank-accounts', { userId: req.user.userId });
    return this.service.list(req.user.userId);
  }
}

