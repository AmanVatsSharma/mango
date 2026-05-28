/**
 * @file src/modules/partners/services/partners.service.ts
 * @module partners
 * @description Partners service scaffold for partner management
 * @author BharatERP
 * @created 2026-02-19
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { CreatePartnerDto } from '../dtos/create-partner.dto';
import { PartnerPayoutApprovalDto } from '../dtos/partner-payout-approval.dto';
import { PartnerEntity } from '../entities/partner.entity';

@Injectable()
export class PartnersService {
  constructor(
    @InjectRepository(PartnerEntity)
    private readonly partners: Repository<PartnerEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(PartnersService.name);
  }

  async createPartner(dto: CreatePartnerDto): Promise<PartnerEntity> {
    this.logger.debug('createPartner:start', dto);
    const saved = await this.partners.save(this.partners.create(dto as any) as unknown as PartnerEntity);
    this.logger.debug('createPartner:end', { partnerId: saved.id });
    return saved;
  }

  async listPartners(tenantId: string): Promise<PartnerEntity[]> {
    return this.partners.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async getPartnerStatus(id: string): Promise<{ id: string; status: string } | null> {
    const partner = await this.partners.findOne({ where: { id }, select: ['id', 'status'] });
    return partner ? { id: partner.id, status: partner.status } : null;
  }

  async approvePayout(
    partnerId: string,
    dto: PartnerPayoutApprovalDto,
  ): Promise<{ partnerId: string; status: string; audit: Record<string, unknown> }> {
    const audit = this.auditEnvelope('PARTNER_PAYOUT_APPROVAL', partnerId, {
      amount: dto.amount,
      currency: dto.currency,
      reason: dto.reason,
    });
    this.logger.warn('partner payout approval requested', audit);
    return { partnerId, status: 'PAYOUT_APPROVED_PENDING_SETTLEMENT', audit };
  }

  private auditEnvelope(
    action: string,
    targetId: string,
    details: Record<string, unknown>,
  ): Record<string, unknown> {
    const ctx = getRequestContext();
    return {
      action,
      targetId,
      details,
      requestId: ctx?.requestId,
      actorUserId: ctx?.userId,
      tenantId: ctx?.tenantId,
      at: new Date().toISOString(),
    };
  }
}
