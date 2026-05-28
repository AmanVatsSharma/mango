/**
 * @file src/modules/demo-accounts/controllers/demo-accounts.controller.ts
 * @module demo-accounts
 * @description REST API for creating and listing demo accounts
 * @author BharatERP
 * @created 2026-03-15
 */

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { DemoAccountService } from '../services/demo-account.service';
import { CreateDemoAccountDto } from '../dtos/create-demo-account.dto';
import { AppLoggerService } from '../../../shared/logger';

@ApiTags('Demo Accounts')
@Controller('demo-accounts')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class DemoAccountsController {
  constructor(
    private readonly service: DemoAccountService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(DemoAccountsController.name);
  }

  @Post()
  @Permissions('accounts:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create demo account with optional seed balance' })
  @ApiBody({ type: CreateDemoAccountDto })
  @ApiResponse({ status: 201, description: 'Demo account created' })
  create(@Body() dto: CreateDemoAccountDto) {
    this.logger.debug('create demo account', dto);
    return this.service.createDemoAccount(dto);
  }

  @Get()
  @Permissions('accounts:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List my demo accounts' })
  @ApiResponse({ status: 200, description: 'List of demo accounts' })
  list() {
    this.logger.debug('list demo accounts');
    return this.service.listDemoAccounts();
  }
}
