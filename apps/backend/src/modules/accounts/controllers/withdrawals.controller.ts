/**
 * @file src/modules/accounts/controllers/withdrawals.controller.ts
 * @module accounts
 * @description Withdrawal requests with approval workflow
 * @author BharatERP
 * @created 2025-09-19
 */

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { LedgerService } from '../services/ledger.service';
import { AppLoggerService } from '../../../shared/logger';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

class CreateWithdrawalDto {
  amount!: string;
  currency!: string;
  externalRefId?: string;
}

@Controller('accounts/:id/withdrawals')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@ApiTags('Accounts')
export class WithdrawalsController {
  constructor(
    private readonly service: LedgerService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(WithdrawalsController.name);
  }

  @Post()
  @Permissions('accounts:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Request withdrawal' })
  @ApiBody({
    schema: {
      properties: {
        amount: { type: 'string', example: '1000.00' },
        currency: { type: 'string', example: 'INR' },
        externalRefId: { type: 'string', example: 'wd-001' },
      },
      required: ['amount', 'currency'],
    },
  })
  @ApiResponse({ status: 201, description: 'Withdrawal requested', schema: { example: { id: 'wd-uuid', status: 'PENDING' } } })
  requestWithdrawal(
    @Param('id') accountId: string,
    @Body() dto: CreateWithdrawalDto,
  ) {
    this.logger.debug('requestWithdrawal called', { accountId, dto });
    return this.service.requestWithdrawal(accountId, dto);
  }

  @Post(':wid/approve')
  @Permissions('accounts:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Approve withdrawal' })
  @ApiResponse({ status: 200, description: 'Approved', schema: { example: { id: 'wd-uuid', status: 'APPROVED' } } })
  approveWithdrawal(@Param('id') accountId: string, @Param('wid') wid: string) {
    this.logger.debug('approveWithdrawal called', { accountId, wid });
    return this.service.approveWithdrawal(accountId, wid);
  }

  @Post(':wid/reject')
  @Permissions('accounts:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Reject withdrawal' })
  @ApiResponse({ status: 200, description: 'Rejected', schema: { example: { id: 'wd-uuid', status: 'REJECTED' } } })
  rejectWithdrawal(@Param('id') accountId: string, @Param('wid') wid: string) {
    this.logger.debug('rejectWithdrawal called', { accountId, wid });
    return this.service.rejectWithdrawal(accountId, wid);
  }

  @Get()
  @Permissions('accounts:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List withdrawals' })
  @ApiResponse({ status: 200, description: 'Withdrawals', schema: { example: [ { id: 'wd-uuid', amount: '1000.00', currency: 'INR', status: 'PENDING' } ] } })
  listWithdrawals(@Param('id') accountId: string) {
    this.logger.debug('listWithdrawals called', { accountId });
    return this.service.listWithdrawals(accountId);
  }
}
