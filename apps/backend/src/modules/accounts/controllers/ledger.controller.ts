/**
 * @file src/modules/accounts/controllers/ledger.controller.ts
 * @module accounts
 * @description Ledger endpoints: cash postings and holds
 * @author BharatERP
 * @created 2025-09-19
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { CashCreditDebitDto } from '../dtos/cash-credit-debit.dto';
import { CashHoldDto, CashReleaseDto } from '../dtos/cash-hold-release.dto';
import { GetLedgerDto } from '../dtos/get-ledger.dto';
import { AppLoggerService } from '../../../shared/logger';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LedgerService } from '../services/ledger.service';

@ApiTags('Accounts')
@Controller('accounts/:id/ledger')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class LedgerController {
  constructor(
    private readonly service: LedgerService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(LedgerController.name);
  }

  @Post('cash')
  @Permissions('ledger:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Post cash entry' })
  @ApiBody({
    type: CashCreditDebitDto,
    examples: {
      deposit: {
        value: {
          currency: 'INR',
          amount: '10000.00',
          direction: 'credit',
          kind: 'deposit',
          externalRefId: 'dep-2025-01-01-001',
        },
      },
      fee: {
        value: {
          currency: 'INR',
          amount: '12.34',
          direction: 'debit',
          kind: 'fee',
          externalRefId: 'fee-ord-123',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Posted', schema: { example: { id: 'cle-uuid' } } })
  @ApiResponse({ status: 200, description: 'Idempotent replay returns existing entry', schema: { example: { id: 'cle-uuid' } } })
  @ApiResponse({ status: 409, description: 'externalRefId reused with different payload', schema: { example: { code: 'DUPLICATE_RESOURCE', message: 'externalRefId already used with different payload' } } })
  postCash(@Param('id') accountId: string, @Body() dto: CashCreditDebitDto) {
    this.logger.debug('postCash called', { accountId, dto });
    return this.service.postCash(accountId, dto);
  }

  @Post('hold')
  @Permissions('ledger:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create cash hold' })
  @ApiBody({
    type: CashHoldDto,
    examples: {
      order: {
        value: {
          amount: '5000.00',
          currency: 'INR',
          reason: 'ORDER',
          externalRefId: 'ord:cli-123',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Hold created', schema: { example: { id: 'hold-uuid' } } })
  @ApiResponse({ status: 200, description: 'Idempotent replay returns existing hold', schema: { example: { id: 'hold-uuid' } } })
  @ApiResponse({ status: 409, description: 'externalRefId reused with different payload', schema: { example: { code: 'DUPLICATE_RESOURCE' } } })
  createHold(@Param('id') accountId: string, @Body() dto: CashHoldDto) {
    this.logger.debug('createHold called', { accountId, dto });
    return this.service.createHold(accountId, dto);
  }

  @Post('release')
  @Permissions('ledger:write')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Release cash hold' })
  @ApiBody({
    type: CashReleaseDto,
    examples: {
      order: { value: { externalRefId: 'ord:cli-123' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Hold released', schema: { example: { success: true } } })
  releaseHold(@Param('id') accountId: string, @Body() dto: CashReleaseDto) {
    this.logger.debug('releaseHold called', { accountId, dto });
    return this.service.releaseHold(accountId, dto);
  }

  @Get()
  @Permissions('ledger:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List ledger entries' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'externalRefId', required: false })
  @ApiQuery({ name: 'kind', required: false })
  @ApiResponse({ status: 200, description: 'Ledger entries', schema: { example: [ { id: 'cle-uuid', amount: '100.00', currency: 'INR', direction: 'credit', kind: 'deposit' } ] } })
  listLedger(@Param('id') accountId: string, @Query() query: GetLedgerDto) {
    this.logger.debug('listLedger called', { accountId, query });
    return this.service.listCashLedger(accountId, query);
  }
}
