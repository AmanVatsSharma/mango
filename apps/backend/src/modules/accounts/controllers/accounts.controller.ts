/**
 * @file src/modules/accounts/controllers/accounts.controller.ts
 * @module accounts
 * @description Accounts CRUD controller secured by JWT and RBAC
 * @author BharatERP
 * @created 2025-09-19
 */

import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { AccountsService } from '../services/accounts.service';
import { CreateAccountDto } from '../dtos/create-account.dto';
import { AppLoggerService } from '../../../shared/logger';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Accounts')
@Controller('accounts')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class AccountsController {
  constructor(
    private readonly service: AccountsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AccountsController.name);
  }

  @Post()
  @Permissions('accounts:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create account' })
  @ApiBody({
    type: CreateAccountDto,
    examples: {
      default: {
        value: {
          userId: 'b8b3d3d2-2a8d-4a62-b6e0-8d5b7b3a7b8c',
          baseCurrency: 'INR',
          status: 'ACTIVE',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Account created', schema: { example: { id: 'acc-uuid', userId: 'b8b3...', baseCurrency: 'INR', status: 'ACTIVE' } } })
  createAccount(@Body() dto: CreateAccountDto) {
    this.logger.debug('createAccount called', dto);
    return this.service.createAccount(dto);
  }

  @Get()
  @Permissions('accounts:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List my accounts' })
  @ApiResponse({ status: 200, description: 'Accounts', schema: { example: [ { id: 'acc-uuid', baseCurrency: 'INR', status: 'ACTIVE' } ] } })
  listMyAccounts() {
    this.logger.debug('listMyAccounts called');
    return this.service.listMyAccounts();
  }

  @Get('all')
  @Permissions('accounts:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Admin list — all accounts for the tenant (optionally filtered by userId)' })
  @ApiResponse({ status: 200, description: 'Accounts for tenant' })
  listAll(@Headers('x-tenant-id') tenantId: string, @Query('userId') userId?: string) {
    this.logger.debug('listAll called', { tenantId, userId });
    return this.service.listByTenant(tenantId, userId);
  }

  @Get(':id')
  @Permissions('accounts:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get account by id' })
  @ApiResponse({ status: 200, description: 'Account', schema: { example: { id: 'acc-uuid', baseCurrency: 'INR', status: 'ACTIVE' } } })
  getById(@Param('id') id: string) {
    this.logger.debug('getById called', { id });
    return this.service.getById(id);
  }

  @Post(':id/disable')
  @Permissions('accounts:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Disable account' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Disabled', schema: { example: { id: 'acc-uuid', status: 'DISABLED' } } })
  disable(@Param('id') id: string) {
    this.logger.debug('disable called', { id });
    return this.service.disableAccount(id);
  }

  @Post(':id/enable')
  @Permissions('accounts:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Enable account' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Enabled', schema: { example: { id: 'acc-uuid', status: 'ACTIVE' } } })
  enable(@Param('id') id: string) {
    this.logger.debug('enable called', { id });
    return this.service.enableAccount(id);
  }
}
