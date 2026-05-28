/**
 * @file src/modules/oms/controllers/margin.controller.ts
 * @module oms
 * @description Margin endpoints for estimating required margin and brokerage
 * @author BharatERP
 * @created 2025-09-24
 */

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { MarginEngineService, MarginEstimate } from '../services/margin-engine.service';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppLoggerService } from '../../../shared/logger';

class CheckMarginDto {
  @IsString()
  @Length(1, 64)
  accountId!: string;

  @IsString()
  @Length(1, 64)
  instrumentId!: string;

  @IsIn(['BUY', 'SELL'])
  side!: 'BUY' | 'SELL';

  @IsIn(['MARKET', 'LIMIT'])
  type!: 'MARKET' | 'LIMIT';

  @IsString()
  @Matches(/^\d{1,20}(\.\d{1,8})?$/)
  quantity!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,20}(\.\d{1,8})?$/)
  price?: string;

  @IsIn(['INTRADAY', 'DELIVERY', 'SHORT', 'LONG'])
  positionType!: 'INTRADAY' | 'DELIVERY' | 'SHORT' | 'LONG';
}

@ApiTags('OMS')
@Controller('oms/margin')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class MarginController {
  constructor(private readonly engine: MarginEngineService, private readonly logger: AppLoggerService) {
    this.logger.setContext(MarginController.name);
  }

  @Post('required')
  @Permissions('orders:read')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Estimate required margin and brokerage for a prospective order' })
  @ApiBody({
    type: CheckMarginDto,
    examples: {
      equityMIS: { value: { accountId: 'acc-uuid', instrumentId: 'inst-uuid', side: 'BUY', type: 'LIMIT', quantity: '100', price: '95.50', positionType: 'INTRADAY' } },
      fnoShort: { value: { accountId: 'acc-uuid', instrumentId: 'inst-fno', side: 'SELL', type: 'LIMIT', quantity: '50', price: '10.00', positionType: 'SHORT' } },
      forex: { value: { accountId: 'acc-uuid', instrumentId: 'inst-forex', side: 'BUY', type: 'MARKET', quantity: '1000', positionType: 'INTRADAY' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Margin estimate' })
  async required(@Body() dto: CheckMarginDto): Promise<MarginEstimate> {
    this.logger.debug('margin.required', dto);
    // Note: availableCash/buyingPower enrichment left to caller or future enhancement
    return this.engine.estimate({ ...dto });
  }
}


