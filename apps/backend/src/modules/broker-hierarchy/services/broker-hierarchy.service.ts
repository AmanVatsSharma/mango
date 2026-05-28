/**
 * File:        apps/backend/src/modules/broker-hierarchy/services/broker-hierarchy.service.ts
 * Module:      broker-hierarchy
 * Purpose:     Service for broker branch/desk/dealer hierarchy and delegated role mapping.
 *
 * Exports:
 *   - BrokerHierarchyService — all broker/branch/desk/dealer CRUD
 *
 * Depends on:
 *   - BrokerEntity           — broker root entity
 *   - BranchEntity           — broker branches
 *   - DeskEntity             — branch desks
 *   - DealerEntity           — desk dealers
 *
 * Side-effects:  DB writes only
 *
 * Key invariants:
 *   - getHierarchy uses batch queries to avoid N+1 — branch/desk/dealer IDs never iterated for per-row queries.
 *
 * Read order:
 *   1. Broker CRUD — createBroker, findBrokerByCode, listAllBrokers
 *   2. Hierarchy aggregation — getHierarchy (batched, not N+1)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-14
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { AssignHierarchyRoleDto } from '../dtos/assign-hierarchy-role.dto';
import { CreateBranchDto } from '../dtos/create-branch.dto';
import { CreateBrokerDto } from '../dtos/create-broker.dto';
import { CreateDealerDto } from '../dtos/create-dealer.dto';
import { CreateDeskDto } from '../dtos/create-desk.dto';
import { BranchEntity } from '../entities/branch.entity';
import { BrokerEntity } from '../entities/broker.entity';
import { DealerEntity } from '../entities/dealer.entity';
import { DeskEntity } from '../entities/desk.entity';
import { HierarchyRoleMappingEntity } from '../entities/hierarchy-role-mapping.entity';

@Injectable()
export class BrokerHierarchyService {
  constructor(
    @InjectRepository(BrokerEntity)
    private readonly brokers: Repository<BrokerEntity>,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(DeskEntity)
    private readonly desks: Repository<DeskEntity>,
    @InjectRepository(DealerEntity)
    private readonly dealers: Repository<DealerEntity>,
    @InjectRepository(HierarchyRoleMappingEntity)
    private readonly roleMappings: Repository<HierarchyRoleMappingEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(BrokerHierarchyService.name);
  }

  async createBroker(dto: CreateBrokerDto): Promise<BrokerEntity> {
    this.logger.debug('createBroker:start', dto);
    const saved = await this.brokers.save(this.brokers.create(dto));
    this.logger.debug('createBroker:end', { brokerId: saved.id });
    return saved;
  }

  findBrokerByCode(tenantId: string, brokerCode: string): Promise<BrokerEntity | null> {
    return this.brokers.findOne({ where: { tenantId, brokerCode } });
  }

  /**
   * List all brokers with optional cursor-based pagination.
   * @param options.limit  Max results (default 50, max 200)
   * @param options.offset Skip N results (default 0)
   * @returns Promise<{ brokers: BrokerEntity[]; total: number }>
   */
  async listAllBrokers(options: { limit?: number; offset?: number } = {}): Promise<{ brokers: BrokerEntity[]; total: number }> {
    const limit = Math.min(options.limit ?? 50, 200);
    const offset = options.offset ?? 0;
    const [brokers, total] = await this.brokers.findAndCount({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { brokers, total };
  }

  /**
   * Legacy overload — returns all brokers (no pagination).
   * @deprecated Use listAllBrokers({ limit, offset }) for production.
   */
  listAllBrokersFlat(): Promise<BrokerEntity[]> {
    return this.brokers.find({ order: { createdAt: 'DESC' } });
  }

  listBrokersByStatus(status: string, options: { limit?: number; offset?: number } = {}): Promise<{ brokers: BrokerEntity[]; total: number }> {
    const limit = Math.min(options.limit ?? 50, 200);
    const offset = options.offset ?? 0;
    return this.brokers.findAndCount({ where: { status }, order: { createdAt: 'DESC' }, take: limit, skip: offset })
      .then(([brokers, total]) => ({ brokers, total }));
  }

  async createBranch(dto: CreateBranchDto): Promise<BranchEntity> {
    this.logger.debug('createBranch:start', dto);
    const saved = await this.branches.save(this.branches.create(dto));
    this.logger.debug('createBranch:end', { branchId: saved.id });
    return saved;
  }

  async createDesk(dto: CreateDeskDto): Promise<DeskEntity> {
    this.logger.debug('createDesk:start', dto);
    const saved = await this.desks.save(this.desks.create(dto));
    this.logger.debug('createDesk:end', { deskId: saved.id });
    return saved;
  }

  async createDealer(dto: CreateDealerDto): Promise<DealerEntity> {
    this.logger.debug('createDealer:start', dto);
    const saved = await this.dealers.save(this.dealers.create(dto));
    this.logger.debug('createDealer:end', { dealerId: saved.id });
    return saved;
  }

  async assignRole(dto: AssignHierarchyRoleDto): Promise<HierarchyRoleMappingEntity> {
    this.logger.debug('assignRole:start', dto);
    const saved = await this.roleMappings.save(this.roleMappings.create(dto));
    this.logger.debug('assignRole:end', { mappingId: saved.id });
    return saved;
  }

  /**
   * Replaces 5 sequential find() calls with 3 targeted queries (brokers + JOIN branches+desks+dealers + roleMappings).
   * Avoids N+1: branch/desk/dealer IDs are never iterated to issue per-row queries.
   */
  async getHierarchy(tenantId: string): Promise<{
    brokers: BrokerEntity[];
    branches: BranchEntity[];
    desks: DeskEntity[];
    dealers: DealerEntity[];
    roleMappings: HierarchyRoleMappingEntity[];
  }> {
    this.logger.debug('getHierarchy:start', { tenantId });

    const brokers = await this.brokers.find({ where: { tenantId }, order: { createdAt: 'DESC' } });

    if (!brokers.length) {
      const roleMappings = await this.roleMappings.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
      return { brokers, branches: [], desks: [], dealers: [], roleMappings };
    }

    const brokerIds = brokers.map((b) => b.id);

    const branches = await this.branches
      .createQueryBuilder('br')
      .where('br.brokerId IN (:...brokerIds)', { brokerIds })
      .orderBy('br.createdAt', 'DESC')
      .getMany();

    const branchIds = branches.map((b) => b.id);

    const desks = branchIds.length
      ? await this.desks
          .createQueryBuilder('d')
          .where('d.branchId IN (:...branchIds)', { branchIds })
          .orderBy('d.createdAt', 'DESC')
          .getMany()
      : [];

    const deskIds = desks.map((d) => d.id);

    const dealers = deskIds.length
      ? await this.dealers
          .createQueryBuilder('dl')
          .where('dl.deskId IN (:...deskIds)', { deskIds })
          .orderBy('dl.createdAt', 'DESC')
          .getMany()
      : [];

    const roleMappings = await this.roleMappings.find({ where: { tenantId }, order: { createdAt: 'DESC' } });

    this.logger.debug('getHierarchy:end', {
      brokers: brokers.length,
      branches: branches.length,
      desks: desks.length,
      dealers: dealers.length,
    });

    return { brokers, branches, desks, dealers, roleMappings };
  }
}
