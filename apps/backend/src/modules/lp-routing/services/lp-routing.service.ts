/**
 * File:        apps/backend/src/modules/lp-routing/services/lp-routing.service.ts
 * Module:      lp-routing
 * Purpose:     LP routing console service — CRUD for LP providers and quote testing
 *
 * Exports:
 *   - LpRoutingService — LP provider management
 *
 * Depends on:
 *   - LpProviderEntity  — LP provider entity
 *   - AppLoggerService  — structured logging
 *
 * Side-effects:  DB writes only
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. Provider CRUD — createProvider, listProviders, updateProvider
 *   2. Quote testing — testQuote
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '@obsidian/backend-shared';
import { AppError } from '@obsidian/backend-common';
import { LpProviderEntity } from '../entities/lp-provider.entity';
import { CreateLpProviderDto } from '../dtos/create-lp-provider.dto';
import { UpdateLpProviderDto } from '../dtos/update-lp-provider.dto';
import { TestLpQuoteDto } from '../dtos/test-lp-quote.dto';

@Injectable()
export class LpRoutingService {
  constructor(
    @InjectRepository(LpProviderEntity)
    private readonly providers: Repository<LpProviderEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(LpRoutingService.name);
  }

  async createProvider(dto: CreateLpProviderDto): Promise<LpProviderEntity> {
    this.logger.debug('createProvider:start', dto);
    const saved = await this.providers.save(this.providers.create(dto));
    this.logger.debug('createProvider:end', { providerId: saved.id });
    return saved;
  }

  async listProviders(tenantId: string): Promise<LpProviderEntity[]> {
    this.logger.debug('listProviders:start', { tenantId });
    return this.providers.find({ where: { tenantId }, order: { priority: 'ASC' } });
  }

  async updateProvider(id: string, dto: UpdateLpProviderDto): Promise<LpProviderEntity> {
    this.logger.debug('updateProvider:start', { id, dto });
    const provider = await this.providers.findOne({ where: { id } });
    if (!provider) {
      throw new AppError('RESOURCE_NOT_FOUND', `LP provider ${id} not found`);
    }
    Object.assign(provider, dto);
    const saved = await this.providers.save(provider);
    this.logger.debug('updateProvider:end', { providerId: saved.id });
    return saved;
  }

  async testQuote(dto: TestLpQuoteDto): Promise<{ provider: string; quote: number; validFor: number }> {
    this.logger.debug('testQuote:start', dto);
    // Stubbed — real implementation would call LP API endpoint
    const quote = Math.random() * 100;
    return { provider: dto.lpProviderId ?? 'default', quote, validFor: 5 };
  }
}