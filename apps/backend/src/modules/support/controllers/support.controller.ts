/**
 * @file src/modules/support/controllers/support.controller.ts
 * @module support
 * @description Support controller scaffold for ticket operations
 * @author BharatERP
 * @created 2026-02-19
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { CreateSupportTicketDto } from '../dtos/create-support-ticket.dto';
import { SupportImpersonationAuditDto } from '../dtos/support-impersonation-audit.dto';
import { SupportTicketEntity } from '../entities/support-ticket.entity';
import { SupportService } from '../services/support.service';

@Controller('support')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('tickets')
  @Permissions('support:write')
  async create(@Body() dto: CreateSupportTicketDto): Promise<SupportTicketEntity> {
    return this.supportService.createTicket(dto);
  }

  @Get('tickets')
  @Permissions('support:read')
  async list(@Query('tenantId') tenantId: string): Promise<SupportTicketEntity[]> {
    return this.supportService.listTickets(tenantId);
  }

  @Get('tickets/:id/status')
  @Permissions('support:read')
  async status(@Param('id') id: string): Promise<{ id: string; status: string } | null> {
    return this.supportService.getTicketStatus(id);
  }

  @Post('tickets/:id/impersonation-audit')
  @Permissions('support:impersonation')
  async auditImpersonation(
    @Param('id') id: string,
    @Body() dto: SupportImpersonationAuditDto,
  ): Promise<{ ticketId: string; status: string; audit: Record<string, unknown> }> {
    return this.supportService.auditImpersonation(id, dto);
  }
}
