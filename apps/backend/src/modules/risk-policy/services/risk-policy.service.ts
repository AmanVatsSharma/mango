/**
 * @file src/modules/risk-policy/services/risk-policy.service.ts
 * @module risk-policy
 * @description Risk policy service for jurisdiction controls, tenant assignments, and pre-trade enforcement
 * @author BharatERP
 * @created 2026-02-17
 * @last-updated 2026-04-24
 *
 * Exports:
 *   - RiskPolicyService.enforcePreTrade(params) → void   — throws RISK_LIMIT_BREACH if policy violated
 *   - RiskPolicyService.createPolicy(dto)                — CRUD
 *   - RiskPolicyService.assignPolicy(dto)                — CRUD
 *   - RiskPolicyService.listPolicies(tenantId)           — CRUD
 *
 * Key invariants:
 *   - tenantId param in enforcePreTrade is the slug (varchar), not UUID
 *     → resolved to UUID via TenantEntity before querying risk_policies
 *   - If no risk policy is assigned to the tenant, enforcement is skipped (fail-open)
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { AppError } from '../../../common/errors/app-error';
import { AssignRiskPolicyDto, CreateRiskPolicyDto } from '../dtos/create-risk-policy.dto';
import { RiskPolicyEntity } from '../entities/risk-policy.entity';
import { TenantRiskPolicyEntity } from '../entities/tenant-risk-policy.entity';
import { TenantEntity } from '../../tenancy/entities/tenant.entity';

export interface PreTradeRiskParams {
  tenantId: string;      // slug (varchar code)
  instrumentId: string;
  quantity: number;
  price: number | null;
  leverage?: number;
}

@Injectable()
export class RiskPolicyService {
  constructor(
    @InjectRepository(RiskPolicyEntity)
    private readonly policies: Repository<RiskPolicyEntity>,
    @InjectRepository(TenantRiskPolicyEntity)
    private readonly assignments: Repository<TenantRiskPolicyEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenants: Repository<TenantEntity>,
    private readonly dataSource: DataSource,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(RiskPolicyService.name);
  }

  async enforcePreTrade(params: PreTradeRiskParams): Promise<void> {
    const tenant = await this.tenants.findOne({ where: { code: params.tenantId } });
    if (!tenant) return; // Unknown tenant slug — let auth layer handle

    const assignment = await this.assignments.findOne({ where: { tenantId: tenant.id } });
    if (!assignment) return; // No policy configured for this tenant — fail-open

    const policy = await this.policies.findOne({ where: { id: assignment.riskPolicyId } });
    if (!policy) return;

    const notional = params.quantity * (params.price ?? 0);
    const maxNotional = Number(policy.maxOrderNotional);
    if (maxNotional > 0 && notional > maxNotional) {
      throw new AppError(
        'RISK_LIMIT_BREACH',
        `Order notional ${notional} exceeds policy limit ${maxNotional}`,
      );
    }

    if (policy.restrictedProducts?.includes(params.instrumentId)) {
      throw new AppError(
        'RISK_LIMIT_BREACH',
        `Instrument ${params.instrumentId} is restricted by tenant risk policy`,
      );
    }

    if (params.leverage && Number(policy.maxLeverage) > 0 && params.leverage > Number(policy.maxLeverage)) {
      throw new AppError(
        'RISK_LIMIT_BREACH',
        `Requested leverage ${params.leverage}x exceeds policy limit ${policy.maxLeverage}x`,
      );
    }

    this.logger.debug('enforcePreTrade:passed', { tenantId: params.tenantId, notional });
  }

  async createPolicy(dto: CreateRiskPolicyDto): Promise<RiskPolicyEntity> {
    this.logger.debug('createPolicy:start', dto);
    const entity = this.policies.create(dto as unknown as RiskPolicyEntity);
    const saved = await this.policies.save(entity);
    this.logger.debug('createPolicy:end', { riskPolicyId: saved.id });
    return saved;
  }

  async assignPolicy(dto: AssignRiskPolicyDto): Promise<TenantRiskPolicyEntity> {
    this.logger.debug('assignPolicy:start', dto);
    const entity = this.assignments.create(dto as unknown as TenantRiskPolicyEntity);
    const saved = await this.assignments.save(entity);
    this.logger.debug('assignPolicy:end', { assignmentId: saved.id });
    return saved;
  }

  async listPolicies(tenantId: string): Promise<RiskPolicyEntity[]> {
    return this.policies.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async listAllPolicies(opts?: { limit?: number; offset?: number }) {
    const { limit = 50, offset = 0 } = opts ?? {};
    this.logger.debug('listAllPolicies:start', { opts });
    const [data, total] = await this.policies.findAndCount({
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });
    return { data, total, limit, offset };
  }

  async listExposure() {
    this.logger.debug('listExposure:start');
    const ctx = getRequestContext();
    const raw = await this.dataSource
      .createQueryRunner()
      .query(
        `SELECT p.instrument_id,
                COALESCE(SUM(p.quantity_delta::numeric), 0) AS net_qty,
                COALESCE(SUM(p.quantity_delta::numeric * p.price::numeric), 0) AS gross_notional
         FROM position_ledger_entries p
         WHERE p.tenant_id = $1
         GROUP BY p.instrument_id`,
        [ctx.tenantId],
      ) as Array<{ instrument_id: string; net_qty: string; gross_notional: string }>;

    const data = (raw as Array<{ instrument_id: string; net_qty: string; gross_notional: string }>).map((r) => ({
      instrumentId: r.instrument_id,
      netQty: Number(r.net_qty),
      grossNotional: Math.abs(Number(r.gross_notional)),
      netNotional: Number(r.net_qty) * Number(r.gross_notional),
    }));

    this.logger.debug('listExposure:end', { instruments: data.length });
    return data;
  }
}
