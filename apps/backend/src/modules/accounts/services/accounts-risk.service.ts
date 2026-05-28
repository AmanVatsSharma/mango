/**
 * @file src/modules/accounts/services/accounts-risk.service.ts
 * @module accounts
 * @description Accounts-local risk accessor for buying-power multiplier to avoid module cycles
 * @author BharatERP
 * @created 2026-02-17
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BuyingPowerRuleEntity } from '../../oms/entities/buying-power-rule.entity';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';

@Injectable()
export class AccountsRiskService {
  constructor(
    @InjectRepository(BuyingPowerRuleEntity)
    private readonly rules: Repository<BuyingPowerRuleEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AccountsRiskService.name);
  }

  async getBuyingPowerMultiplier(
    segment?: string,
    positionType?: string,
  ): Promise<number> {
    const ctx = getRequestContext();
    const where: any = { tenantId: ctx?.tenantId, isActive: true };
    if (segment) where.segment = segment;
    if (positionType) where.positionType = positionType;
    const rule = await this.rules.findOne({ where });
    const multiplier = rule ? Number(rule.multiplier) : 1;
    this.logger.debug('Resolved buying power multiplier (accounts)', {
      segment,
      positionType,
      multiplier,
    });
    return multiplier;
  }
}
