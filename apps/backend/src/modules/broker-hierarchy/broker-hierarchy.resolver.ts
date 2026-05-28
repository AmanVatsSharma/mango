/**
 * File:        apps/backend/src/modules/broker-hierarchy/broker-hierarchy.resolver.ts
 * Module:      broker-hierarchy · GraphQL Resolver
 * Purpose:     GraphQL Query/Mutation surface over BrokerHierarchyService.
 *              Covers: broker/branch/desk/dealer CRUD and hierarchical aggregation.
 *
 * Exports:
 *   - BrokerHierarchyResolver   — GraphQL API for broker hierarchy management
 *   - BrokerObjectType          — broker node shape
 *   - BranchObjectType          — branch node shape
 *   - DeskObjectType            — desk node shape
 *   - DealerObjectType          — dealer node shape
 *   - BrokerHierarchyObjectType — full hierarchy result (batched, not N+1)
 *
 * Depends on:
 *   - BrokerHierarchyService — all hierarchy CRUD and getHierarchy
 *   - BrokerEntity / BranchEntity / DeskEntity / DealerEntity — entity shapes
 *   - JwtAuthGuard           — auth enforcement
 *   - TenantGuard            — tenant isolation
 *   - PermissionsGuard       — permission enforcement
 *   - Permissions             — permission decorator
 *   - Tenant                  — tenant decorator
 *
 * Side-effects: DB writes on createBroker, createBranch, createDesk, createDealer
 *
 * Key invariants:
 *   - All operations require broker-hierarchy:read or broker-hierarchy:write permission
 *   - getHierarchy uses 3 batch queries (not N+1) — branch/desk/dealer IDs never iterated
 *   - Pagination via limit/offset on list queries (max 200)
 *
 * Read order:
 *   1. ObjectType definitions   — data shapes
 *   2. BrokerHierarchyResolver   — query/mutation definitions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Resolver, Query, Mutation, Args, ID, Int, ObjectType, Field } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { BrokerHierarchyService } from './services/broker-hierarchy.service';
import { BrokerEntity } from './entities/broker.entity';
import { BranchEntity } from './entities/branch.entity';
import { DeskEntity } from './entities/desk.entity';
import { DealerEntity } from './entities/dealer.entity';
import { HierarchyRoleMappingEntity } from './entities/hierarchy-role-mapping.entity';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { AppLoggerService } from '@obsidian/backend-shared';

/* ── GraphQL ObjectTypes ──────────────────────────────────────────────────── */

@ObjectType('Broker')
export class BrokerObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  brokerCode!: string;

  @Field()
  displayName!: string;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;
}

@ObjectType('Branch')
export class BranchObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  brokerId!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  region!: string | null;

  @Field()
  status!: string;

  @Field()
  createdAt!: string;
}

@ObjectType('Desk')
export class DeskObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  branchId!: string;

  @Field()
  name!: string;

  @Field()
  createdAt!: string;
}

@ObjectType('Dealer')
export class DealerObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  deskId!: string;

  @Field()
  userId!: string;

  @Field({ nullable: true })
  displayName!: string | null;

  @Field()
  createdAt!: string;
}

@ObjectType('BrokerHierarchyResult')
export class BrokerHierarchyResultObjectType {
  @Field(() => [BrokerObjectType])
  brokers!: BrokerObjectType[];

  @Field(() => [BranchObjectType])
  branches!: BranchObjectType[];

  @Field(() => [DeskObjectType])
  desks!: DeskObjectType[];

  @Field(() => [DealerObjectType])
  dealers!: DealerObjectType[];

  @Field(() => Int)
  brokerCount!: number;

  @Field(() => Int)
  branchCount!: number;

  @Field(() => Int)
  deskCount!: number;

  @Field(() => Int)
  dealerCount!: number;
}

@ObjectType('BrokerListResult')
export class BrokerListResultObjectType {
  @Field(() => [BrokerObjectType])
  brokers!: BrokerObjectType[];

  @Field(() => Int)
  total!: number;
}

/* ── Resolver ──────────────────────────────────────────────────────────────── */

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class BrokerHierarchyResolver {
  constructor(
    private readonly brokerHierarchyService: BrokerHierarchyService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(BrokerHierarchyResolver.name);
  }

  // ── Hierarchy queries ─────────────────────────────────────────────────────

  @Query(() => BrokerHierarchyResultObjectType, { name: 'brokerHierarchy' })
  @Permissions('broker-hierarchy:read')
  async getHierarchy(@Tenant() tenantId: string): Promise<BrokerHierarchyResultObjectType> {
    const { brokers, branches, desks, dealers } = await this.brokerHierarchyService.getHierarchy(tenantId);
    return {
      brokers: brokers.map((b) => this.mapBroker(b)),
      branches: branches.map((br) => this.mapBranch(br)),
      desks: desks.map((d) => this.mapDesk(d)),
      dealers: dealers.map((dl) => this.mapDealer(dl)),
      brokerCount: brokers.length,
      branchCount: branches.length,
      deskCount: desks.length,
      dealerCount: dealers.length,
    };
  }

  @Query(() => BrokerListResultObjectType, { name: 'brokers' })
  @Permissions('broker-hierarchy:read')
  async listBrokers(
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number,
  ): Promise<BrokerListResultObjectType> {
    const result = await this.brokerHierarchyService.listAllBrokers({ limit, offset });
    return {
      brokers: result.brokers.map((b) => this.mapBroker(b)),
      total: result.total,
    };
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  @Mutation(() => BrokerObjectType)
  @Permissions('broker-hierarchy:write')
  async createBroker(
    @Tenant() tenantId: string,
    @Args('brokerCode') brokerCode: string,
    @Args('displayName') displayName: string,
  ): Promise<BrokerObjectType> {
    const broker = await this.brokerHierarchyService.createBroker({ tenantId, brokerCode, displayName } as any);
    return this.mapBroker(broker);
  }

  @Mutation(() => BranchObjectType)
  @Permissions('broker-hierarchy:write')
  async createBranch(
    @Tenant() tenantId: string,
    @Args('brokerId') brokerId: string,
    @Args('name') name: string,
    @Args('region', { nullable: true }) region?: string,
  ): Promise<BranchObjectType> {
    const branch = await this.brokerHierarchyService.createBranch({ tenantId, brokerId, name, region } as any);
    return this.mapBranch(branch);
  }

  @Mutation(() => DeskObjectType)
  @Permissions('broker-hierarchy:write')
  async createDesk(
    @Tenant() tenantId: string,
    @Args('branchId') branchId: string,
    @Args('name') name: string,
  ): Promise<DeskObjectType> {
    const desk = await this.brokerHierarchyService.createDesk({ tenantId, branchId, name } as any);
    return this.mapDesk(desk);
  }

  @Mutation(() => DealerObjectType)
  @Permissions('broker-hierarchy:write')
  async createDealer(
    @Tenant() tenantId: string,
    @Args('deskId') deskId: string,
    @Args('userId') userId: string,
  ): Promise<DealerObjectType> {
    const dealer = await this.brokerHierarchyService.createDealer({ tenantId, deskId, userId } as any);
    return this.mapDealer(dealer);
  }

  // ── Mappers ───────────────────────────────────────────────────────────────

  private mapBroker(b: BrokerEntity): BrokerObjectType {
    return {
      id: b.id,
      tenantId: b.tenantId,
      brokerCode: b.brokerCode,
      displayName: b.displayName,
      status: b.status,
      createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt ?? ''),
    };
  }

  private mapBranch(b: BranchEntity): BranchObjectType {
    return {
      id: b.id,
      tenantId: b.tenantId,
      brokerId: b.brokerId,
      name: b.displayName,
      region: null,
      status: 'ACTIVE',
      createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt ?? ''),
    };
  }

  private mapDesk(d: DeskEntity): DeskObjectType {
    return {
      id: d.id,
      tenantId: '',
      branchId: d.branchId,
      name: d.displayName,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt ?? ''),
    };
  }

  private mapDealer(d: DealerEntity): DealerObjectType {
    return {
      id: d.id,
      tenantId: d.tenantId,
      deskId: d.deskId,
      userId: d.userId,
      displayName: null,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt ?? ''),
    };
  }
}