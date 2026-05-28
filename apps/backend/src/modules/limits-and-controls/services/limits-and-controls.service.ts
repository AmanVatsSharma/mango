/**
 * @file src/modules/limits-and-controls/services/limits-and-controls.service.ts
 * @module limits-and-controls
 * @description Limits configuration, exception queues, and pre-trade enforcement gates
 * @author BharatERP
 * @created 2026-02-17
 * @last-updated 2026-04-24
 *
 * Exports:
 *   - LimitsAndControlsService.enforcePreTrade(params) → void  — throws RISK_LIMIT_BREACH on violation
 *   - LimitsAndControlsService.createControl(dto)              — CRUD
 *   - LimitsAndControlsService.listControls(tenantId)          — CRUD
 *   - LimitsAndControlsService.createException(dto)            — CRUD
 *   - LimitsAndControlsService.listExceptions(tenantId)        — CRUD
 *
 * Supported controlTypes:
 *   MAX_OPEN_ORDERS     — threshold = max simultaneous open orders (scope: ACCOUNT or TENANT)
 *   MAX_ORDER_NOTIONAL  — threshold = max order notional value in base currency
 *   INSTRUMENT_BLACKLIST — scopeValue = instrumentId; any matching enabled control = rejected
 *
 * Key invariants:
 *   - tenantId in limits DB is UUID; tenantId slug is resolved via TenantEntity
 *   - openOrderCount must be passed in by caller (OrderService knows this from its repository)
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { AppError } from '../../../common/errors/app-error';
import { CreateLimitControlDto, CreateLimitExceptionDto } from '../dtos/create-limit-control.dto';
import { LimitControlEntity } from '../entities/limit-control.entity';
import { LimitExceptionEntity } from '../entities/limit-exception.entity';
import { TenantEntity } from '../../tenancy/entities/tenant.entity';

export interface PreTradeLimitParams {
  tenantId: string;       // slug (varchar code)
  accountId: string;
  instrumentId: string;
  notional: number;
  openOrderCount: number; // current open order count for this account (caller provides)
}

@Injectable()
export class LimitsAndControlsService {
  constructor(
    @InjectRepository(LimitControlEntity)
    private readonly controls: Repository<LimitControlEntity>,
    @InjectRepository(LimitExceptionEntity)
    private readonly exceptions: Repository<LimitExceptionEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenants: Repository<TenantEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(LimitsAndControlsService.name);
  }

  async enforcePreTrade(params: PreTradeLimitParams): Promise<void> {
    const tenant = await this.tenants.findOne({ where: { code: params.tenantId } });
    if (!tenant) return;

    const activeControls = await this.controls.find({
      where: { tenantId: tenant.id, enabled: true },
    });
    if (!activeControls.length) return;

    for (const ctrl of activeControls) {
      const threshold = Number(ctrl.threshold);
      const isAccountScoped =
        ctrl.scopeType === 'ACCOUNT' && ctrl.scopeValue === params.accountId;
      const isTenantScoped = ctrl.scopeType === 'TENANT';

      if (ctrl.controlType === 'MAX_OPEN_ORDERS' && (isAccountScoped || isTenantScoped)) {
        if (params.openOrderCount >= threshold) {
          throw new AppError(
            'RISK_LIMIT_BREACH',
            `Open order count ${params.openOrderCount} reaches limit of ${threshold}`,
          );
        }
      }

      if (ctrl.controlType === 'MAX_ORDER_NOTIONAL' && (isAccountScoped || isTenantScoped)) {
        if (params.notional > threshold) {
          throw new AppError(
            'RISK_LIMIT_BREACH',
            `Order notional ${params.notional} exceeds limit ${threshold}`,
          );
        }
      }

      if (ctrl.controlType === 'INSTRUMENT_BLACKLIST' && ctrl.scopeValue === params.instrumentId) {
        throw new AppError(
          'RISK_LIMIT_BREACH',
          `Instrument ${params.instrumentId} is blacklisted by operational controls`,
        );
      }
    }

    this.logger.debug('enforcePreTrade:passed', { tenantId: params.tenantId, accountId: params.accountId });
  }

  async createControl(dto: CreateLimitControlDto): Promise<LimitControlEntity> {
    this.logger.debug('createControl:start', dto);
    const saved = await this.controls.save(this.controls.create(dto));
    this.logger.debug('createControl:end', { controlId: saved.id });
    return saved;
  }

  async listControls(tenantId: string): Promise<LimitControlEntity[]> {
    return this.controls.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async createException(dto: CreateLimitExceptionDto): Promise<LimitExceptionEntity> {
    this.logger.debug('createException:start', dto);
    const saved = await this.exceptions.save(this.exceptions.create(dto as any) as unknown as LimitExceptionEntity);
    this.logger.debug('createException:end', { exceptionId: saved.id });
    return saved;
  }

  async listExceptions(tenantId: string): Promise<LimitExceptionEntity[]> {
    return this.exceptions.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }
}
