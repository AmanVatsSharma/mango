/**
 * @file src/modules/market/controllers/instruments.controller.ts
 * @module market
 * @description Instruments controller for listing instruments and exchanges
 * @author BharatERP
 * @created 2025-09-19
 */

import { Controller, Get, Query } from '@nestjs/common';
import { InstrumentsService } from '../services/instruments.service';
import { AppLoggerService } from '../../../shared/logger';
import { ListInstrumentsQueryDto } from '../dto/instruments.dto';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

@Controller('market')
@ApiTags('Instruments')
export class InstrumentsController {
  constructor(
    private readonly svc: InstrumentsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(InstrumentsController.name);
  }

  @Get('exchanges')
  @ApiOperation({ summary: 'List exchanges' })
  @ApiResponse({ status: 200, description: 'Exchanges', schema: { example: [ { code: 'NSE', name: 'National Stock Exchange' } ] } })
  listExchanges() {
    this.logger.debug('GET /market/exchanges');
    return this.svc.listExchanges();
  }

  @Get('instruments')
  @ApiOperation({ summary: 'List instruments' })
  @ApiQuery({ name: 'exchange', required: false, example: 'NSE' })
  @ApiQuery({ name: 'type', required: false, example: 'EQUITY' })
  @ApiQuery({ name: 'q', required: false, example: 'RELIANCE' })
  @ApiResponse({ status: 200, description: 'Instruments', schema: { example: [ { id: 'instr-uuid', exchange: 'NSE', symbol: 'RELIANCE', name: 'Reliance Industries Ltd' } ] } })
  listInstruments(@Query() query: ListInstrumentsQueryDto) {
    this.logger.debug('GET /market/instruments', query as any);
    return this.svc.listInstruments({
      exchangeCode: query.exchange,
      type: query.type,
      q: query.q,
    });
  }
}
