/**
 * @file src/modules/support/services/support.service.ts
 * @module support
 * @description Support service scaffold for ticket management
 * @author BharatERP
 * @created 2026-02-19
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { CreateSupportTicketDto } from '../dtos/create-support-ticket.dto';
import { SupportImpersonationAuditDto } from '../dtos/support-impersonation-audit.dto';
import { SupportTicketEntity } from '../entities/support-ticket.entity';

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicketEntity)
    private readonly tickets: Repository<SupportTicketEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(SupportService.name);
  }

  async createTicket(dto: CreateSupportTicketDto): Promise<SupportTicketEntity> {
    this.logger.debug('createTicket:start', dto);
    const saved = await this.tickets.save(this.tickets.create(dto as any) as unknown as SupportTicketEntity);
    this.logger.debug('createTicket:end', { ticketId: saved.id });
    return saved;
  }

  async listTickets(tenantId: string): Promise<SupportTicketEntity[]> {
    return this.tickets.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async getTicketStatus(id: string): Promise<{ id: string; status: string } | null> {
    const ticket = await this.tickets.findOne({ where: { id }, select: ['id', 'status'] });
    return ticket ? { id: ticket.id, status: ticket.status } : null;
  }

  async auditImpersonation(
    ticketId: string,
    dto: SupportImpersonationAuditDto,
  ): Promise<{ ticketId: string; status: string; audit: Record<string, unknown> }> {
    const audit = this.auditEnvelope('SUPPORT_IMPERSONATION_AUDIT', ticketId, {
      actorUserId: dto.actorUserId,
      targetUserId: dto.targetUserId,
      reason: dto.reason,
    });
    this.logger.warn('support impersonation audit captured', audit);
    return { ticketId, status: 'AUDITED', audit };
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
