/**
 * File:        apps/backend/src/modules/compliance/services/compliance.service.ts
 * Module:      compliance
 * Purpose:     Compliance policy management and pluggable jurisdiction adapter dispatch.
 *              Selects the correct adapter by jurisdictionCode and runs pre-trade checks.
 *
 * Exports:
 *   - ComplianceService.upsertPolicy(dto) → CompliancePolicyEntity
 *   - ComplianceService.listPolicies(tenantId) → CompliancePolicyEntity[]
 *   - ComplianceService.enforcePreTrade(params) → void  — throws on violation
 *
 * Depends on:
 *   - DfsaAdapter, FcaAdapter — jurisdiction-specific check implementations
 *   - CompliancePolicyEntity  — looks up active policy for tenant's jurisdiction
 *
 * Side-effects:
 *   - DB read (policy lookup) on every enforcePreTrade() call
 *
 * Key invariants:
 *   - If no compliance policy is configured for the tenant's jurisdiction, enforcePreTrade is a no-op
 *   - Adapter violations are aggregated and thrown as a single COMPLIANCE_BREACH AppError
 *   - Adding a new jurisdiction = create adapter + register in ADAPTER_REGISTRY below
 *
 * Read order:
 *   1. enforcePreTrade() — main entry; calls adapter registry lookup + check
 *   2. upsertPolicy()    — admin configuration
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { AppLoggerService } from '../../../shared/logger';
import { UpsertCompliancePolicyDto } from '../dtos/upsert-compliance-policy.dto';
import { CompliancePolicyEntity } from '../entities/compliance-policy.entity';
import { IComplianceAdapter, PreTradeComplianceParams } from '../adapters/compliance-adapter.interface';
import { DfsaAdapter } from '../adapters/dfsa.adapter';
import { FcaAdapter } from '../adapters/fca.adapter';

@Injectable()
export class ComplianceService {
  private readonly adapters: Map<string, IComplianceAdapter>;

  constructor(
    @InjectRepository(CompliancePolicyEntity)
    private readonly policies: Repository<CompliancePolicyEntity>,
    private readonly logger: AppLoggerService,
    dfsaAdapter: DfsaAdapter,
    fcaAdapter: FcaAdapter,
  ) {
    this.logger.setContext(ComplianceService.name);
    this.adapters = new Map([
      [dfsaAdapter.jurisdictionCode(), dfsaAdapter],
      [fcaAdapter.jurisdictionCode(), fcaAdapter],
    ]);
  }

  async upsertPolicy(dto: UpsertCompliancePolicyDto): Promise<CompliancePolicyEntity> {
    this.logger.debug('upsertPolicy:start', dto);
    const existing = await this.policies.findOne({
      where: { tenantId: dto.tenantId, jurisdictionCode: dto.jurisdictionCode },
    });
    const entity = this.policies.create({ ...(existing ?? {}), ...dto } as any) as unknown as CompliancePolicyEntity;
    const saved = await this.policies.save(entity);
    this.logger.debug('upsertPolicy:end', { policyId: saved.id });
    return saved;
  }

  async listPolicies(tenantId: string): Promise<CompliancePolicyEntity[]> {
    this.logger.debug('listPolicies:start', { tenantId });
    return this.policies.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async enforcePreTrade(params: PreTradeComplianceParams): Promise<void> {
    this.logger.debug('enforcePreTrade:start', {
      tenantId: params.tenantId,
      instrumentType: params.instrumentType,
    });

    const tenantPolicies = await this.policies.find({ where: { tenantId: params.tenantId } });
    if (!tenantPolicies.length) return;

    const allViolations: string[] = [];

    for (const policy of tenantPolicies) {
      const adapter = this.adapters.get(policy.jurisdictionCode);
      if (!adapter) continue;

      const result = await adapter.enforcePreTrade(params);
      if (!result.passed) {
        allViolations.push(...result.violations);
      }
    }

    if (allViolations.length > 0) {
      throw new AppError('COMPLIANCE_BREACH', allViolations.join('; '));
    }

    this.logger.debug('enforcePreTrade:passed', { tenantId: params.tenantId });
  }
}
