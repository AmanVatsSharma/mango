/**
 * File:        apps/backend/src/modules/broker-hierarchy/services/broker-exchange-config.service.ts
 * Module:      broker-hierarchy
 * Purpose:     Admin-facing service to manage per-broker exchange access, and OMS-facing
 *              isExchangeEnabled() guard used before every order is placed.
 *
 * Exports:
 *   - BrokerExchangeConfigService
 *       .listForBroker(brokerId)           → BrokerExchangeConfigEntity[]
 *       .setAccess(brokerId, code, dto)    → BrokerExchangeConfigEntity  (upsert)
 *       .bulkSet(brokerId, entries[])      → void
 *       .isExchangeEnabled(brokerId, code)             → boolean
 *       .isExchangeEnabledForTenant(tenantId, code)   → boolean  (OMS uses this)
 *
 * Depends on:
 *   - BrokerExchangeConfigEntity repo
 *   - AppLoggerService
 *
 * Side-effects:
 *   - DB reads/writes to broker_exchange_configs
 *
 * Key invariants:
 *   - isExchangeEnabled returns false (not throws) when no config row exists —
 *     "opt-in" model: exchanges are disabled until explicitly enabled
 *   - setAccess is idempotent — upsert by (brokerId, exchangeCode)
 *
 * Read order:
 *   1. isExchangeEnabled()  — used by OMS hot path
 *   2. setAccess()          — admin upsert
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-08
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { BrokerExchangeConfigEntity } from '../entities/broker-exchange-config.entity';
import { BrokerEntity } from '../entities/broker.entity';
import { BulkExchangeEntryDto, SetExchangeAccessDto } from '../dtos/broker-exchange-config.dto';

@Injectable()
export class BrokerExchangeConfigService {
  constructor(
    @InjectRepository(BrokerExchangeConfigEntity)
    private readonly repo: Repository<BrokerExchangeConfigEntity>,
    @InjectRepository(BrokerEntity)
    private readonly brokerRepo: Repository<BrokerEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(BrokerExchangeConfigService.name);
  }

  listForBroker(brokerId: string): Promise<BrokerExchangeConfigEntity[]> {
    this.logger.debug('listForBroker', { brokerId });
    return this.repo.find({ where: { brokerId }, order: { exchangeCode: 'ASC' } });
  }

  async setAccess(
    brokerId: string,
    exchangeCode: string,
    dto: SetExchangeAccessDto,
  ): Promise<BrokerExchangeConfigEntity> {
    this.logger.debug('setAccess', { brokerId, exchangeCode, enabled: dto.enabled });
    const existing = await this.repo.findOne({ where: { brokerId, exchangeCode } });
    const entity = this.repo.create({
      ...(existing ?? {}),
      brokerId,
      exchangeCode,
      enabled: dto.enabled,
      connectorFamily: dto.connectorFamily ?? existing?.connectorFamily ?? null,
    });
    return this.repo.save(entity);
  }

  async bulkSet(brokerId: string, entries: BulkExchangeEntryDto[]): Promise<void> {
    this.logger.debug('bulkSet', { brokerId, count: entries.length });
    for (const entry of entries) {
      await this.setAccess(brokerId, entry.exchangeCode, {
        enabled: entry.enabled,
        connectorFamily: entry.connectorFamily,
      });
    }
  }

  async isExchangeEnabled(brokerId: string, exchangeCode: string): Promise<boolean> {
    this.logger.debug('isExchangeEnabled', { brokerId, exchangeCode });
    const config = await this.repo.findOne({ where: { brokerId, exchangeCode } });
    return config?.enabled === true;
  }

  /** OMS-facing: resolves the tenant's primary active broker then checks exchange access. */
  async isExchangeEnabledForTenant(tenantId: string, exchangeCode: string): Promise<boolean> {
    this.logger.debug('isExchangeEnabledForTenant', { tenantId, exchangeCode });
    const broker = await this.brokerRepo.findOne({ where: { tenantId, status: 'ACTIVE' } });
    if (!broker) return false;
    return this.isExchangeEnabled(broker.id, exchangeCode);
  }
}
