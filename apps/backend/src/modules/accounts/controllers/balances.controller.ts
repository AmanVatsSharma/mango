/**
 * @file src/modules/accounts/controllers/balances.controller.ts
 * @module accounts
 * @description Balances endpoints for cash, equity, positions, and buying power
 * @author BharatERP
 * @created 2025-09-19
 */

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { GetBalancesDto } from '../dtos/get-balances.dto';
import { AppLoggerService } from '../../../shared/logger';
import { BalancesService } from '../services/balances.service';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Accounts')
@Controller('accounts/:id/balances')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class BalancesController {
  constructor(
    private readonly service: BalancesService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(BalancesController.name);
  }

  @Get()
  @Permissions('accounts:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get balances', description: 'Returns cash, positions value, equity, buying power, with FX conversion' })
  @ApiQuery({ name: 'currency', required: false })
  @ApiResponse({ status: 200, description: 'Balances', schema: { example: { cash: { INR: '10000.00' }, equity: '25000.00', buyingPower: '50000.00' } } })
  getBalances(@Param('id') accountId: string, @Query() query: GetBalancesDto) {
    this.logger.debug('getBalances called', { accountId, query });
    return this.service.getBalances(accountId, query);
  }
}
