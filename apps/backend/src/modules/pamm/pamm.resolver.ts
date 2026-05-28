/**
 * File:        apps/backend/src/modules/pamm/pamm.resolver.ts
 * Module:      pamm · GraphQL Resolver
 * Purpose:     GraphQL Query/Mutation surface over PammService.
 *              Covers: PAMM master strategy CRUD and slave allocation management.
 *
 * Exports:
 *   - PammResolver                  — GraphQL API for PAMM management
 *   - PammMasterObjectType          — master strategy shape
 *   - PammSlaveObjectType           — slave allocation shape
 *
 * Depends on:
 *   - PammService        — PAMM master and slave CRUD
 *   - PamMMasterEntity   — master entity shape
 *   - PamMSlaveEntity    — slave entity shape
 *   - JwtAuthGuard       — auth enforcement
 *   - TenantGuard        — tenant isolation
 *   - PermissionsGuard   — permission enforcement
 *   - Permissions        — permission decorator
 *   - Tenant             — tenant decorator
 *
 * Side-effects: DB writes on createMaster and createOrUpdateAllocation
 *
 * Key invariants:
 *   - All operations require pamm:read or pamm:write permission
 *   - tenantId sourced from @Tenant() decorator
 *   - createOrUpdateAllocation is upsert semantics — updates existing or creates new
 *
 * Read order:
 *   1. ObjectType definitions  — data shapes
 *   2. PammResolver            — query/mutation definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, Mutation, Args, ID, ObjectType, Field, Float } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PammService } from './services/pamm.service';
import { PamMMasterEntity } from './entities/pamm-master.entity';
import { PamMSlaveEntity } from './entities/pamm-slave.entity';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { AppLoggerService } from '@obsidian/backend-shared';

/* ── GraphQL ObjectTypes ──────────────────────────────────────────────────── */

@ObjectType('PammMaster')
export class PammMasterObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  strategyDescription!: string | null;

  @Field(() => Float)
  minAllocation!: number;

  @Field(() => Float)
  performanceFee!: number;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;
}

@ObjectType('PammSlave')
export class PammSlaveObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  masterId!: string;

  @Field()
  userId!: string;

  @Field(() => Float)
  allocationPct!: number;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class PammResolver {
  constructor(
    private readonly pammService: PammService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(PammResolver.name);
  }

  // ── Master queries ────────────────────────────────────────────────────────

  @Query(() => [PammMasterObjectType], { name: 'pammMasters' })
  @Permissions('pamm:read')
  async listMasters(@Tenant() tenantId: string): Promise<PammMasterObjectType[]> {
    const masters = await this.pammService.listMasters(tenantId);
    return masters.map((m) => this.mapMaster(m));
  }

  @Query(() => PammMasterObjectType, { name: 'pammMaster', nullable: true })
  @Permissions('pamm:read')
  async getMaster(@Args('id') id: string): Promise<PammMasterObjectType | null> {
    const master = await this.pammService.findMasterById(id);
    return master ? this.mapMaster(master) : null;
  }

  // ── Slave queries ──────────────────────────────────────────────────────────

  @Query(() => [PammSlaveObjectType], { name: 'pammSlaves' })
  @Permissions('pamm:read')
  async listSlaves(@Tenant() tenantId: string): Promise<PammSlaveObjectType[]> {
    const slaves = await this.pammService.listSlaves(tenantId);
    return slaves.map((s) => this.mapSlave(s));
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  @Mutation(() => PammMasterObjectType)
  @Permissions('pamm:write')
  async createPammMaster(
    @Tenant() tenantId: string,
    @Args('name') name: string,
    @Args('minAllocation', { type: () => Float }) minAllocation: number,
    @Args('performanceFee', { type: () => Float }) performanceFee: number,
    @Args('strategyDescription', { nullable: true }) strategyDescription?: string,
  ): Promise<PammMasterObjectType> {
    const master = await this.pammService.createMaster({
      tenantId,
      name,
      minAllocation,
      performanceFee,
      strategyDescription,
    } as any);
    return this.mapMaster(master);
  }

  @Mutation(() => PammSlaveObjectType)
  @Permissions('pamm:write')
  async createOrUpdatePammAllocation(
    @Tenant() tenantId: string,
    @Args('masterId') masterId: string,
    @Args('userId') userId: string,
    @Args('allocationPct', { type: () => Float }) allocationPct: number,
  ): Promise<PammSlaveObjectType> {
    const slave = await this.pammService.createOrUpdateAllocation({
      tenantId,
      masterId,
      userId,
      allocationPct,
    } as any);
    return this.mapSlave(slave);
  }

  // ── Mappers ───────────────────────────────────────────────────────────────

  private mapMaster(m: PamMMasterEntity): PammMasterObjectType {
    return {
      id: m.id,
      tenantId: m.tenantId,
      name: m.name,
      strategyDescription: m.strategyDescription ?? null,
      minAllocation: Number(m.minAllocation),
      performanceFee: Number(m.performanceFee),
      status: m.status,
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt ?? ''),
    };
  }

  private mapSlave(s: PamMSlaveEntity): PammSlaveObjectType {
    return {
      id: s.id,
      tenantId: s.tenantId,
      masterId: s.masterId,
      userId: s.userId,
      allocationPct: Number(s.allocationPct),
      status: s.status,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt ?? ''),
    };
  }
}