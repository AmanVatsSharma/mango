/**
 * File:        apps/backend/src/modules/pamm/services/pamm.service.ts
 * Module:      pamm
 * Purpose:     PAMM strategy and allocation management service
 *
 * Exports:
 *   - PammService — PAMM CRUD operations
 *
 * Depends on:
 *   - PamMMasterEntity     — master strategy entity
 *   - PamMSlaveEntity    — slave allocation entity
 *   - AppLoggerService   — structured logging
 *
 * Side-effects:  DB writes only
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. Master CRUD — createMaster, listMasters
 *   2. Slave allocation — createOrUpdateAllocation, listSlaves
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '@obsidian/backend-shared';
import { AppError } from '@obsidian/backend-common';
import { PamMMasterEntity } from '../entities/pamm-master.entity';
import { PamMSlaveEntity } from '../entities/pamm-slave.entity';
import { CreatePamMMasterDto } from '../dtos/create-pamm-master.dto';
import { CreatePamMAllocationDto } from '../dtos/create-pamm-allocation.dto';

@Injectable()
export class PammService {
  constructor(
    @InjectRepository(PamMMasterEntity)
    private readonly masters: Repository<PamMMasterEntity>,
    @InjectRepository(PamMSlaveEntity)
    private readonly slaves: Repository<PamMSlaveEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(PammService.name);
  }

  // ─── Master CRUD ──────────────────────────────────────────────────────────────

  async createMaster(dto: CreatePamMMasterDto): Promise<PamMMasterEntity> {
    this.logger.debug('createMaster:start', dto);
    const entity = this.masters.create({
      tenantId: dto.tenantId,
      name: dto.name,
      strategyDescription: dto.strategyDescription ?? null,
      minAllocation: String(dto.minAllocation),
      performanceFee: String(dto.performanceFee),
      status: 'ACTIVE',
    });
    const saved = await this.masters.save(entity);
    this.logger.debug('createMaster:end', { masterId: saved.id });
    return saved;
  }

  async listMasters(tenantId: string): Promise<PamMMasterEntity[]> {
    this.logger.debug('listMasters:start', { tenantId });
    return this.masters.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async findMasterById(id: string): Promise<PamMMasterEntity | null> {
    return this.masters.findOne({ where: { id } });
  }

  // ─── Slave Allocation ────────────────────────────────────────────────────────

  async createOrUpdateAllocation(dto: CreatePamMAllocationDto): Promise<PamMSlaveEntity> {
    this.logger.debug('createOrUpdateAllocation:start', dto);

    const existing = await this.slaves.findOne({
      where: { masterId: dto.masterId, userId: dto.userId },
    });

    if (existing) {
      existing.allocationPct = String(dto.allocationPct);
      const updated = await this.slaves.save(existing);
      this.logger.debug('createOrUpdateAllocation:updated', { slaveId: updated.id });
      return updated;
    }

    const entity = this.slaves.create({
      tenantId: dto.tenantId,
      masterId: dto.masterId,
      userId: dto.userId,
      allocationPct: String(dto.allocationPct),
      status: 'ACTIVE',
    });
    const saved = await this.slaves.save(entity);
    this.logger.debug('createOrUpdateAllocation:created', { slaveId: saved.id });
    return saved;
  }

  async listSlaves(tenantId: string): Promise<PamMSlaveEntity[]> {
    this.logger.debug('listSlaves:start', { tenantId });
    return this.slaves.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }
}