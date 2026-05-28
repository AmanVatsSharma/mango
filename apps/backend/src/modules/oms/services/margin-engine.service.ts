/**
 * @file src/modules/oms/services/margin-engine.service.ts
 * @module oms
 * @description Margin engine: computes initial/maintenance margin and brokerage with admin/user overrides
 * @author BharatERP
 * @created 2025-09-24
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { BuyingPowerRuleEntity } from '../entities/buying-power-rule.entity';
import { UserLeverageOverrideEntity } from '../entities/user-leverage-override.entity';
import { BrokerageRuleEntity } from '../entities/brokerage-rule.entity';
import { InstrumentsService } from '../../market/services/instruments.service';

export type MarginEstimateInput = {
  accountId: string;
  userId?: string;
  instrumentId: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: string;
  price?: string | null;
  positionType: 'INTRADAY' | 'DELIVERY' | 'SHORT' | 'LONG';
};

export type MarginEstimate = {
  initialMargin: string;
  maintenanceMargin: string;
  brokerage: string;
  totalRequired: string;
  buyingPower: string;
  availableCash?: string;
  canPlace: boolean;
  reasons: string[];
  appliedRules: Record<string, unknown>;
};

@Injectable()
export class MarginEngineService {
  constructor(
    @InjectRepository(BuyingPowerRuleEntity)
    private readonly buyingPowerRules: Repository<BuyingPowerRuleEntity>,
    @InjectRepository(UserLeverageOverrideEntity)
    private readonly userOverrides: Repository<UserLeverageOverrideEntity>,
    @InjectRepository(BrokerageRuleEntity)
    private readonly brokerageRules: Repository<BrokerageRuleEntity>,
    private readonly instruments: InstrumentsService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(MarginEngineService.name);
  }

  async estimate(input: MarginEstimateInput): Promise<MarginEstimate> {
    const ctx = getRequestContext();
    const reasons: string[] = [];

    // Instrument for segment/product awareness
    const inst = (await this.instruments.listByIds([input.instrumentId]))[0];
    const segment = inst?.type === 'FNO' ? 'FNO' : (inst?.type as any) || 'EQUITY';

    // Buying power rule
    const bpRule = await this.buyingPowerRules.findOne({
      where: { tenantId: ctx.tenantId, segment: segment, positionType: input.positionType, isActive: true },
    });
    const baseMultiplier = bpRule ? Number(bpRule.multiplier) : 1;

    // User override multiplier (if active)
    const now = new Date();
    let overrideMultiplier = 1;
    if (input.userId) {
      const ov = await this.userOverrides.findOne({
        where: { tenantId: ctx.tenantId, userId: input.userId, segment: segment, positionType: input.positionType, isActive: true },
      });
      if (ov && (!ov.validFrom || ov.validFrom <= now) && (!ov.validTo || ov.validTo >= now)) {
        overrideMultiplier = Number(ov.leverageMultiplier || '1');
      }
    }

    const effectiveMultiplier = baseMultiplier * overrideMultiplier;

    // Simplified initial/maintenance margin heuristics per product
    const qty = Number(input.quantity);
    const px = Number(input.price ?? '0');
    const notion = px > 0 ? qty * px : qty * 1; // fallback 1 for MARKET, refined later via snapshot pricing

    // Futures/Options require product-specific logic; simplified approximation
    let initial = 0;
    let maintenance = 0;
    if (segment === 'FNO') {
      if (input.positionType === 'SHORT' || input.side === 'SELL') {
        // Option writing / short positions: higher margin percentage
        initial = notion * 0.2; // 20% placeholder
        maintenance = notion * 0.15; // 15% placeholder
      } else {
        // Long futures/options
        initial = notion * 0.1;
        maintenance = notion * 0.08;
      }
    } else if (segment === 'FOREX') {
      initial = notion * 0.05;
      maintenance = notion * 0.03;
    } else if (segment === 'CRYPTO') {
      initial = notion * 0.1;
      maintenance = notion * 0.08;
    } else {
      // EQUITY
      if (input.positionType === 'INTRADAY') {
        initial = notion * 0.1;
        maintenance = notion * 0.05;
      } else {
        initial = notion * 1; // full cash for delivery
        maintenance = 0;
      }
    }

    // Apply leverage multiplier (higher multiplier => higher buying power, lower required cash)
    // Here we translate multiplier to reduced requirement (divide requirement by multiplier)
    if (effectiveMultiplier > 0) {
      initial = initial / effectiveMultiplier;
      maintenance = maintenance / effectiveMultiplier;
    }

    // Brokerage rules (tenant -> user override precedence)
    let brokerage = 0;
    const userRule = await this.brokerageRules.findOne({
      where: { tenantId: ctx.tenantId, appliesTo: 'USER', userId: input.userId ?? ('' as any), segment: segment, isActive: true },
    });
    const tenantRule = await this.brokerageRules.findOne({
      where: { tenantId: ctx.tenantId, appliesTo: 'TENANT', segment: segment, isActive: true },
    });
    const rule = userRule || tenantRule;
    if (rule) {
      const matchesSide = rule.side === 'BOTH' || rule.side === input.side;
      if (matchesSide) {
        brokerage = notion * Number(rule.percent || '0') + Number(rule.perOrderFlat || '0');
        if (rule.capPerOrder) brokerage = Math.min(brokerage, Number(rule.capPerOrder));
      }
    }

    const totalRequired = (initial + brokerage).toFixed(8);
    const applied = {
      segment,
      baseMultiplier,
      overrideMultiplier,
      effectiveMultiplier,
      brokerageRuleId: rule?.id ?? null,
    };

    // Leave available/buyingPower population to caller when accounts context is present
    const result: MarginEstimate = {
      initialMargin: initial.toFixed(8),
      maintenanceMargin: maintenance.toFixed(8),
      brokerage: brokerage.toFixed(8),
      totalRequired,
      buyingPower: '0',
      canPlace: true,
      reasons,
      appliedRules: applied,
    };
    return result;
  }
}


