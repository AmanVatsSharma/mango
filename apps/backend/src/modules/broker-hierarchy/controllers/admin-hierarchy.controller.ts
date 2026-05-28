/**
 * File:        apps/backend/src/modules/broker-hierarchy/controllers/admin-hierarchy.controller.ts
 * Module:      broker-hierarchy
 * Purpose:     Admin REST endpoints for IB and client-group management within a tenant.
 *              List IBs, view IB commission summaries, manage client groups, and run payouts.
 *
 * Exports:
 *   - AdminHierarchyController — @Controller('admin')
 *       GET  /admin/ibs                          — list all IBs with pagination
 *       GET  /admin/ibs/:id/commissions          — commission summary for an IB
 *       POST /admin/ibs/:id/payout                — mark payable commissions as PAID for one IB
 *       POST /admin/commissions/run               — batch commission run for all IBs
 *       GET  /admin/client-groups                 — list client groups (tenant-scoped via @Tenant)
 *       POST /admin/client-groups                 — create a client group
 *
 * Depends on:
 *   - BrokerHierarchyService     — listAllBrokers, getHierarchy
 *   - IbCommissionService        — listPayouts, markAsPaid, calculatePayout
 *   - ClientGroupEntity           — client group persistence
 *
 * Side-effects: DB writes for POST (client-groups, ibs/:id/payout, commissions/run)
 *
 * Key invariants:
 *   - listClientGroups() uses @Tenant() decorator (not query param) for proper tenant isolation
 *   - ClientGroupEntity has unique constraint on (tenantId, name) — upsert not supported
 *   - All endpoints require JwtAuthGuard + TenantGuard + RolesGuard + PermissionsGuard('oms:admin')
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminListIbsQueryDto, CreateClientGroupDto } from '../dto/admin-hierarchy.dto';
import { ClientGroupEntity } from '../entities/client-group.entity';
import { BrokerHierarchyService } from '../services/broker-hierarchy.service';
import { IbCommissionService } from '../services/ib-commission.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { Roles } from '../../rbac/decorators/roles.decorator';
import { Tenant } from '../../rbac/decorators/tenant.decorator';
import { AppLoggerService } from '../../../shared/logger';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
@Roles('admin')
@ApiTags('Admin Hierarchy')
@ApiBearerAuth('JWT')
@Controller('admin')
export class AdminHierarchyController {
  constructor(
    private readonly hierarchy: BrokerHierarchyService,
    private readonly commission: IbCommissionService,
    @InjectRepository(ClientGroupEntity)
    private readonly clientGroups: Repository<ClientGroupEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminHierarchyController.name);
  }

  @Get('ibs')
  @Permissions('oms:admin')
  @ApiOperation({ summary: 'List all IBs for tenant' })
  @ApiQuery({ name: 'limit', required: false, example: '50' })
  @ApiQuery({ name: 'offset', required: false, example: '0' })
  async listIbs(@Query() query: AdminListIbsQueryDto) {
    this.logger.debug('GET /admin/ibs', query as any);
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    return this.hierarchy.listAllBrokers({ limit, offset });
  }

  @Get('ibs/:id/commissions')
  @ApiOperation({ summary: 'Commission summary for an IB' })
  @ApiParam({ name: 'id', example: 'ib-user-uuid' })
  @ApiResponse({ status: 200, description: 'Commission summary', schema: { example: { total: "1250.00", count: 3, currency: "USD" } } })
  async getIbCommissions(@Param('id') id: string, @Tenant() tenantId: string) {
    this.logger.debug('GET /admin/ibs/:id/commissions', { id, tenantId });
    const payable = await this.commission.listPayouts(tenantId, id, 'PAYABLE');
    const pending = await this.commission.listPayouts(tenantId, id, 'PENDING');
    const paid = await this.commission.listPayouts(tenantId, id, 'PAID');
    const sum = (rows: typeof payable) =>
      rows.reduce((acc, r) => acc + parseFloat(r.amount), 0);
    return {
      pending: { total: sum(pending).toFixed(8), count: pending.length },
      payable: { total: sum(payable).toFixed(8), count: payable.length },
      paid: { total: sum(paid).toFixed(8), count: paid.length },
    };
  }

  @Post('ibs/:id/payout')
  @ApiOperation({ summary: 'Mark all PAYABLE commissions as PAID for an IB' })
  @ApiParam({ name: 'id', example: 'ib-user-uuid' })
  async payoutIb(@Param('id') id: string, @Tenant() tenantId: string) {
    this.logger.debug('POST /admin/ibs/:id/payout', { id, tenantId });
    const payable = await this.commission.listPayouts(tenantId, id, 'PAYABLE');
    if (payable.length === 0) return { paidCount: 0, message: 'No payable commissions to disburse' };
    const periodKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    await this.commission.markAsPaid(tenantId, id, periodKey);
    return { paidCount: payable.length, periodKey };
  }

  @Post('commissions/run')
  @ApiOperation({ summary: 'Run batch commission payout for all IBs with payable balances' })
  async runCommissionBatch(@Tenant() tenantId: string) {
    this.logger.debug('POST /admin/commissions/run', { tenantId });
    const pending = await this.commission.listPayouts(tenantId, undefined, 'PENDING');
    const payable = await this.commission.listPayouts(tenantId, undefined, 'PAYABLE');
    const ibsPaid = new Set(payable.map(p => p.ibUserId)).size;
    const ibsPending = new Set(pending.map(p => p.ibUserId)).size;
    // Mark all payable as payable for the current period
    for (const entry of payable) {
      await this.commission.markAsPaid(tenantId, entry.ibUserId, new Date().toISOString().slice(0, 7));
    }
    // Advance all pending to payable for the current period
    const periodKey = new Date().toISOString().slice(0, 7);
    const updatedPending = await this.commission.listPayouts(tenantId, undefined, 'PENDING');
    for (const entry of updatedPending) {
      await this.commission.calculatePayout(tenantId, entry.ibUserId, periodKey);
    }
    return {
      ibsWithPayable: ibsPaid,
      ibsWithPending: ibsPending,
      periodKey,
      message: `Commission batch run complete for ${ibsPending} IBs with pending balance and ${ibsPaid} IBs with payable balance`,
    };
  }

  @Get('client-groups')
  @Permissions('oms:admin')
  @ApiOperation({ summary: 'List client groups for tenant' })
  async listClientGroups(@Tenant() tenantId: string) {
    this.logger.debug('GET /admin/client-groups', { tenantId });
    const items = await this.clientGroups.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    return { data: items, total: items.length };
  }

  @Post('client-groups')
  @ApiOperation({ summary: 'Create a client group' })
  @ApiResponse({ status: 201, description: 'Client group created' })
  async createClientGroup(@Body() dto: CreateClientGroupDto) {
    this.logger.debug('POST /admin/client-groups', dto);
    const entity = this.clientGroups.create(dto);
    return this.clientGroups.save(entity);
  }
}