/**
 * File:        apps/backend/src/modules/admin/services/admin-bonuses.service.ts
 * Module:      admin · Bonuses Service
 * Purpose:     In-memory bonus program store. Replaces the inline store in
 *              AdminBonusesController with a proper service layer.
 *
 * Exports:
 *   - AdminBonusesService — Injectable, provides list/create/update/remove
 *
 * Depends on:
 *   - AppLoggerService   — structured request logging
 *   - AppError           — RESOURCE_NOT_FOUND on missing bonus
 *
 * Side-effects:
 *   - In-memory store only; state lost on process restart (no DB)
 *
 * Key invariants:
 *   - DELETE performs soft-delete (status → Inactive) rather than hard-delete
 *   - IDs are server-assigned sequential strings
 *
 * Read order:
 *   1. AdminBonusesService — all methods
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../../../shared/logger';
import { AppError } from '../../../common/errors/app-error';

export type BonusType = 'Welcome' | 'Deposit' | 'No Deposit' | 'Loyalty' | 'Referral' | 'Cashback' | 'Contest';
export type BonusStatus = 'Active' | 'Inactive' | 'Expired' | 'Scheduled';
export type AmountType = 'Fixed' | 'Percentage';

export interface BonusResponseDto {
  id: string;
  name: string;
  type: BonusType;
  status: BonusStatus;
  amount: number;
  amountType: AmountType;
  minDeposit?: number;
  maxBonus?: number;
  turnoverMultiple: number;
  claimedCount: number;
  totalAwarded: number;
  startDate: string;
  endDate?: string;
  eligibleGroups: string[];
}

export interface CreateBonusDto {
  name: string;
  type: BonusType;
  amount: number;
  amountType: AmountType;
  minDeposit?: number;
  maxBonus?: number;
  turnoverMultiple: number;
  startDate: string;
  endDate?: string;
  eligibleGroups: string[];
}

export interface UpdateBonusDto {
  name?: string;
  type?: BonusType;
  amount?: number;
  amountType?: AmountType;
  minDeposit?: number;
  maxBonus?: number;
  turnoverMultiple?: number;
  startDate?: string;
  endDate?: string;
  eligibleGroups?: string[];
}

let _nextId = 20;

const _BONUSES: BonusResponseDto[] = [
  {
    id: 'B001', name: 'New Year Welcome Bonus', type: 'Welcome', status: 'Active',
    amount: 30, amountType: 'Percentage', minDeposit: 100, maxBonus: 500,
    turnoverMultiple: 5, claimedCount: 142, totalAwarded: 28_400,
    startDate: '2024-01-01', endDate: '2024-03-31', eligibleGroups: ['Standard', 'Pro'],
  },
  {
    id: 'B002', name: 'VIP Cashback February', type: 'Cashback', status: 'Scheduled',
    amount: 5, amountType: 'Percentage', minDeposit: 1_000, maxBonus: 1_000,
    turnoverMultiple: 3, claimedCount: 0, totalAwarded: 0,
    startDate: '2024-02-01', endDate: '2024-02-29', eligibleGroups: ['VIP'],
  },
  {
    id: 'B003', name: 'Q4 Trading Blitz Prize', type: 'Contest', status: 'Expired',
    amount: 20_000, amountType: 'Fixed', turnoverMultiple: 0,
    claimedCount: 284, totalAwarded: 20_000,
    startDate: '2023-10-01', endDate: '2023-12-31', eligibleGroups: ['Standard', 'Pro', 'VIP'],
  },
  {
    id: 'B004', name: 'Referral Sprint', type: 'Referral', status: 'Active',
    amount: 50, amountType: 'Fixed', turnoverMultiple: 0,
    claimedCount: 28, totalAwarded: 4_200,
    startDate: '2024-01-10', endDate: '2024-03-10', eligibleGroups: ['Standard', 'Pro'],
  },
  {
    id: 'B005', name: 'No-Deposit Starter', type: 'No Deposit', status: 'Inactive',
    amount: 25, amountType: 'Fixed', turnoverMultiple: 10,
    claimedCount: 0, totalAwarded: 0,
    startDate: '2024-02-15', endDate: '2024-03-15', eligibleGroups: ['Standard'],
  },
];

@Injectable()
export class AdminBonusesService {
  constructor(private readonly logger: AppLoggerService) {
    this.logger.setContext(AdminBonusesService.name);
  }

  list(): BonusResponseDto[] {
    this.logger.debug('AdminBonusesService.list()');
    return _BONUSES;
  }

  create(dto: CreateBonusDto): BonusResponseDto {
    this.logger.debug('AdminBonusesService.create()', { name: dto.name });
    const bonus: BonusResponseDto = {
      id: `B${String(++_nextId).padStart(3, '0')}`,
      ...dto,
      status: 'Active',
      claimedCount: 0,
      totalAwarded: 0,
    };
    _BONUSES.push(bonus);
    return bonus;
  }

  update(id: string, dto: UpdateBonusDto): BonusResponseDto {
    this.logger.debug('AdminBonusesService.update()', { id });
    const idx = _BONUSES.findIndex(b => b.id === id);
    if (idx === -1) throw new AppError('RESOURCE_NOT_FOUND', `Bonus ${id} not found`);
    _BONUSES[idx] = { ..._BONUSES[idx], ...dto };
    return _BONUSES[idx];
  }

  remove(id: string): BonusResponseDto {
    this.logger.debug('AdminBonusesService.remove()', { id });
    const idx = _BONUSES.findIndex(b => b.id === id);
    if (idx === -1) throw new AppError('RESOURCE_NOT_FOUND', `Bonus ${id} not found`);
    _BONUSES[idx] = { ..._BONUSES[idx], status: 'Inactive' };
    return _BONUSES[idx];
  }
}