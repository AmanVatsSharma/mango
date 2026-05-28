/**
 * @file src/modules/oms/services/risk-config.service.ts
 * @module oms
 * @description Provides buying power multipliers and margin rates per tenant/segment/position-type
 * @author BharatERP
 * @created 2025-09-19
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BuyingPowerRuleEntity } from '../entities/buying-power-rule.entity';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';

@Injectable()
export class RiskConfigService {
  constructor(
    @InjectRepository(BuyingPowerRuleEntity)
    private readonly rules: Repository<BuyingPowerRuleEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(RiskConfigService.name);
  }

  async getBuyingPowerMultiplier(segment?: string, positionType?: string): Promise<number> {
    const ctx = getRequestContext();
    const where: any = { tenantId: ctx?.tenantId, isActive: true };
    if (segment) where.segment = segment;
    if (positionType) where.positionType = positionType;
    const rule = await this.rules.findOne({ where });
    const multiplier = rule ? Number(rule.multiplier) : 1;
    this.logger.debug('Resolved buying power multiplier', { segment, positionType, multiplier });
    return multiplier;
  }
}


