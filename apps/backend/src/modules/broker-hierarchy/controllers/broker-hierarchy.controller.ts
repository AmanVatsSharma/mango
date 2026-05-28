/**
 * File:        apps/backend/src/modules/broker-hierarchy/controllers/broker-hierarchy.controller.ts
 * Module:      broker-hierarchy
 * Purpose:     Admin REST endpoints for broker hierarchy management and per-broker
 *              exchange access control (enable/disable NSE, BSE, MCX, etc. per broker).
 *
 * Exports:
 *   - BrokerHierarchyController — @Controller('broker-hierarchy')
 *       POST   /broker-hierarchy/brokers
 *       POST   /broker-hierarchy/branches
 *       POST   /broker-hierarchy/desks
 *       POST   /broker-hierarchy/dealers
 *       POST   /broker-hierarchy/roles
 *       GET    /broker-hierarchy/tenant/:tenantId
 *       GET    /broker-hierarchy/brokers/:brokerId/exchanges        — list exchange configs
 *       PUT    /broker-hierarchy/brokers/:brokerId/exchanges/:code  — toggle single exchange
 *       POST   /broker-hierarchy/brokers/:brokerId/exchanges/bulk   — bulk configure
 *
 * Depends on:
 *   - BrokerHierarchyService        — hierarchy CRUD
 *   - BrokerExchangeConfigService   — exchange access CRUD
 *
 * Side-effects:
 *   - DB writes via services
 *
 * Key invariants:
 *   - All exchange-toggle endpoints require admin role (guard added at module level)
 *
 * Read order:
 *   1. Exchange endpoints (GET/PUT/POST exchanges) — new functionality
 *   2. Hierarchy endpoints — existing
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-08
 */

import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AssignHierarchyRoleDto } from '../dtos/assign-hierarchy-role.dto';
import { CreateBranchDto } from '../dtos/create-branch.dto';
import { CreateBrokerDto } from '../dtos/create-broker.dto';
import { CreateDealerDto } from '../dtos/create-dealer.dto';
import { CreateDeskDto } from '../dtos/create-desk.dto';
import {
  BulkSetExchangesDto,
  SetExchangeAccessDto,
} from '../dtos/broker-exchange-config.dto';
import { BranchEntity } from '../entities/branch.entity';
import { BrokerEntity } from '../entities/broker.entity';
import { DealerEntity } from '../entities/dealer.entity';
import { DeskEntity } from '../entities/desk.entity';
import { HierarchyRoleMappingEntity } from '../entities/hierarchy-role-mapping.entity';
import { BrokerExchangeConfigEntity } from '../entities/broker-exchange-config.entity';
import { BrokerHierarchyService } from '../services/broker-hierarchy.service';
import { BrokerExchangeConfigService } from '../services/broker-exchange-config.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PlatformOwnerGuard } from '../../rbac/guards/platform-owner.guard';

@Controller('broker-hierarchy')
export class BrokerHierarchyController {
  constructor(
    private readonly brokerHierarchyService: BrokerHierarchyService,
    private readonly exchangeConfigService: BrokerExchangeConfigService,
  ) {}

  @UseGuards(JwtAuthGuard, PlatformOwnerGuard)
  @Post('brokers')
  async createBroker(@Body() dto: CreateBrokerDto): Promise<BrokerEntity> {
    return this.brokerHierarchyService.createBroker(dto);
  }

  @Post('branches')
  async createBranch(@Body() dto: CreateBranchDto): Promise<BranchEntity> {
    return this.brokerHierarchyService.createBranch(dto);
  }

  @Post('desks')
  async createDesk(@Body() dto: CreateDeskDto): Promise<DeskEntity> {
    return this.brokerHierarchyService.createDesk(dto);
  }

  @Post('dealers')
  async createDealer(@Body() dto: CreateDealerDto): Promise<DealerEntity> {
    return this.brokerHierarchyService.createDealer(dto);
  }

  @Post('roles')
  async assignRole(@Body() dto: AssignHierarchyRoleDto): Promise<HierarchyRoleMappingEntity> {
    return this.brokerHierarchyService.assignRole(dto);
  }

  @Get('tenant/:tenantId')
  async getHierarchy(@Param('tenantId') tenantId: string) {
    return this.brokerHierarchyService.getHierarchy(tenantId);
  }

  // ─── Exchange Access Control ─────────────────────────────────────────────────

  @Get('brokers/:brokerId/exchanges')
  async listExchanges(
    @Param('brokerId') brokerId: string,
  ): Promise<BrokerExchangeConfigEntity[]> {
    return this.exchangeConfigService.listForBroker(brokerId);
  }

  @Put('brokers/:brokerId/exchanges/:code')
  async setExchangeAccess(
    @Param('brokerId') brokerId: string,
    @Param('code') code: string,
    @Body() dto: SetExchangeAccessDto,
  ): Promise<BrokerExchangeConfigEntity> {
    return this.exchangeConfigService.setAccess(brokerId, code.toUpperCase(), dto);
  }

  @Post('brokers/:brokerId/exchanges/bulk')
  async bulkSetExchanges(
    @Param('brokerId') brokerId: string,
    @Body() dto: BulkSetExchangesDto,
  ): Promise<{ updated: number }> {
    await this.exchangeConfigService.bulkSet(brokerId, dto.exchanges);
    return { updated: dto.exchanges.length };
  }
}
