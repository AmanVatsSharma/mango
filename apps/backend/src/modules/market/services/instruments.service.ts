/**
 * @file src/modules/market/services/instruments.service.ts
 * @module market
 * @description Service for instrument discovery and metadata
 * @author BharatERP
 * @created 2025-09-19
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstrumentEntity } from '../entities/instrument.entity';
import { ExchangeEntity } from '../entities/exchange.entity';
import { AppLoggerService } from '../../../shared/logger';
import { AppError } from '../../../common/errors/app-error';

@Injectable()
export class InstrumentsService {
  constructor(
    @InjectRepository(InstrumentEntity)
    private readonly instruments: Repository<InstrumentEntity>,
    @InjectRepository(ExchangeEntity)
    private readonly exchanges: Repository<ExchangeEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(InstrumentsService.name);
  }

  listExchanges(): Promise<ExchangeEntity[]> {
    this.logger.debug('listExchanges() called');
    return this.exchanges.find();
  }

  listInstruments(filters: {
    exchangeCode?: string;
    type?: string;
    q?: string;
  }): Promise<InstrumentEntity[]> {
    this.logger.debug('listInstruments() called', filters);
    const where: any = {};
    if (filters.exchangeCode) where.exchangeCode = filters.exchangeCode;
    if (filters.type) where.type = filters.type;
    // basic contains search on symbol/displayName
    return this.instruments.find({ where });
  }

  getBySymbol(
    exchangeCode: string,
    symbol: string,
  ): Promise<InstrumentEntity | null> {
    this.logger.debug('getBySymbol() called', { exchangeCode, symbol });
    return this.instruments.findOne({ where: { exchangeCode, symbol } });
  }

  listByIds(ids: string[]): Promise<InstrumentEntity[]> {
    this.logger.debug('listByIds() called', { count: ids.length });
    if (ids.length === 0) return Promise.resolve([]);
    return this.instruments.find({ where: ids.map((id) => ({ id })) as any });
  }

  /**
   * Partial update for admin instrument management.
   * Throws RESOURCE_NOT_FOUND when no instrument matches the id.
   */
  async updateInstrument(
    id: string,
    attrs: { status?: string },
  ): Promise<InstrumentEntity> {
    this.logger.debug('updateInstrument() called', { id, attrs });
    const existing = await this.instruments.findOne({ where: { id } });
    if (!existing) {
      const { AppError } = await import('../../../common/errors/app-error');
      throw new AppError('RESOURCE_NOT_FOUND', `Instrument ${id} not found`);
    }
    const updated = this.instruments.create({ ...existing, ...attrs });
    return this.instruments.save(updated);
  }
}
