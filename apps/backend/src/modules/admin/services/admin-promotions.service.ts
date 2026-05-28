/**
 * File:        apps/backend/src/modules/admin/services/admin-promotions.service.ts
 * Module:      admin · Promotions Service
 * Purpose:     In-memory promotion-campaign store. Replaces the inline store in
 *              AdminPromotionsController with a proper service layer.
 *
 * Exports:
 *   - AdminPromotionsService — Injectable, provides list/create/update
 *
 * Depends on:
 *   - AppLoggerService   — structured request logging
 *   - AppError           — RESOURCE_NOT_FOUND on missing promotion
 *
 * Side-effects:
 *   - In-memory store only; state lost on process restart (no DB)
 *
 * Key invariants:
 *   - budget and spent are stored in cents to avoid floating-point issues
 *
 * Read order:
 *   1. AdminPromotionsService — all methods
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../../../shared/logger';
import { AppError } from '../../../common/errors/app-error';

export type CampaignStatus = 'Active' | 'Scheduled' | 'Ended' | 'Draft';
export type CampaignType = 'Deposit Bonus' | 'No-Deposit Bonus' | 'Cashback' | 'Rebate' | 'Referral' | 'Trading Contest';
export type TargetAudience = 'All Clients' | 'New Clients' | 'VIP' | 'Dormant' | 'IB Clients';

export interface PromotionResponseDto {
  id: string;
  name: string;
  type: CampaignType;
  targetAudience: TargetAudience;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  budget: number;          // in cents
  spent: number;           // in cents
  participants: number;
  conversions: number;
  rewardType: string;
  rewardValue: string;
}

export interface CreatePromotionDto {
  name: string;
  type: CampaignType;
  targetAudience: TargetAudience;
  startDate: string;
  endDate: string;
  budget: number;
  rewardType: string;
  rewardValue: string;
}

export interface UpdatePromotionDto {
  name?: string;
  type?: CampaignType;
  targetAudience?: TargetAudience;
  startDate?: string;
  endDate?: string;
  budget?: number;
  rewardType?: string;
  rewardValue?: string;
  status?: CampaignStatus;
}

let _nextId = 10;

const _PROMOTIONS: PromotionResponseDto[] = [
  {
    id: 'C001', name: 'January Welcome Bonus', type: 'Deposit Bonus',
    targetAudience: 'New Clients', status: 'Active',
    startDate: '2024-01-01', endDate: '2024-01-31',
    budget: 5_000_000, spent: 1_842_000,
    participants: 142, conversions: 98,
    rewardType: '30% match bonus', rewardValue: 'Up to $500',
  },
  {
    id: 'C002', name: 'VIP Cashback February', type: 'Cashback',
    targetAudience: 'VIP', status: 'Scheduled',
    startDate: '2024-02-01', endDate: '2024-02-29',
    budget: 3_000_000, spent: 0,
    participants: 0, conversions: 0,
    rewardType: '5% spread cashback', rewardValue: 'Up to $1,000',
  },
  {
    id: 'C003', name: 'Q4 Trading Blitz', type: 'Trading Contest',
    targetAudience: 'All Clients', status: 'Ended',
    startDate: '2023-10-01', endDate: '2023-12-31',
    budget: 2_000_000, spent: 2_000_000,
    participants: 284, conversions: 284,
    rewardType: 'Prize pool distribution', rewardValue: '$20,000 prize pool',
  },
  {
    id: 'C004', name: 'Referral Sprint', type: 'Referral',
    targetAudience: 'All Clients', status: 'Active',
    startDate: '2024-01-10', endDate: '2024-03-10',
    budget: 1_500_000, spent: 420_000,
    participants: 67, conversions: 28,
    rewardType: '$50 per referral deposit', rewardValue: 'Unlimited',
  },
  {
    id: 'C005', name: 'No-Deposit Starter', type: 'No-Deposit Bonus',
    targetAudience: 'New Clients', status: 'Draft',
    startDate: '2024-02-15', endDate: '2024-03-15',
    budget: 500_000, spent: 0,
    participants: 0, conversions: 0,
    rewardType: '$25 free credit', rewardValue: '$25',
  },
  {
    id: 'C006', name: 'IB Volume Rebate', type: 'Rebate',
    targetAudience: 'IB Clients', status: 'Active',
    startDate: '2024-01-01', endDate: '2024-12-31',
    budget: 8_000_000, spent: 1_284_000,
    participants: 18, conversions: 18,
    rewardType: '$0.50/lot rebate', rewardValue: 'Per lot traded',
  },
];

@Injectable()
export class AdminPromotionsService {
  constructor(private readonly logger: AppLoggerService) {
    this.logger.setContext(AdminPromotionsService.name);
  }

  list(): PromotionResponseDto[] {
    this.logger.debug('AdminPromotionsService.list()');
    return _PROMOTIONS;
  }

  create(dto: CreatePromotionDto): PromotionResponseDto {
    this.logger.debug('AdminPromotionsService.create()', { name: dto.name });
    const campaign: PromotionResponseDto = {
      id: `C${String(++_nextId).padStart(3, '0')}`,
      ...dto,
      status: 'Draft',
      spent: 0,
      participants: 0,
      conversions: 0,
    };
    _PROMOTIONS.push(campaign);
    return campaign;
  }

  update(id: string, dto: UpdatePromotionDto): PromotionResponseDto {
    this.logger.debug('AdminPromotionsService.update()', { id });
    const idx = _PROMOTIONS.findIndex(c => c.id === id);
    if (idx === -1) throw new AppError('RESOURCE_NOT_FOUND', `Promotion ${id} not found`);
    _PROMOTIONS[idx] = { ..._PROMOTIONS[idx], ...dto };
    return _PROMOTIONS[idx];
  }
}