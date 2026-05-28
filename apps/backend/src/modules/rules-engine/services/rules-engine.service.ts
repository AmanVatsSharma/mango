/**
 * File:        apps/backend/src/modules/rules-engine/services/rules-engine.service.ts
 * Module:      rules-engine
 * Purpose:     CRUD for automation rules — create, update, activate/deactivate, list.
 *
 * Exports:
 *   - RulesEngineService.createRule(dto, tenantId) → RuleEntity
 *   - RulesEngineService.updateRule(id, dto, tenantId) → RuleEntity
 *   - RulesEngineService.deleteRule(id, tenantId) → void
 *   - RulesEngineService.listRules(tenantId) → RuleEntity[]
 *   - RulesEngineService.toggleRule(id, tenantId) → RuleEntity
 *   - RulesEngineService.incrementExecution(id) → void
 *
 * Depends on:
 *   - OutboxService — emits automation_rule.triggered events
 *
 * Side-effects: DB writes; outbox event on toggle
 *
 * Key invariants:
 *   - Name unique per tenant — upsert not supported; create fails on duplicate
 *   - Status transitions: ACTIVE ↔ INACTIVE (no other states)
 *   - incrementExecution() is fire-and-forget (non-blocking)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RuleEntity } from '../entities/rule.entity';
import { CreateRuleDto, UpdateRuleDto } from '../dtos/rule.dto';
import { AppError } from '../../../common/errors/app-error';
import { AppLoggerService } from '../../../shared/logger';
import { OutboxService } from '../../../shared/outbox/outbox.service';

@Injectable()
export class RulesEngineService {
  constructor(
    @InjectRepository(RuleEntity)
    private readonly rules: Repository<RuleEntity>,
    private readonly logger: AppLoggerService,
    private readonly outbox: OutboxService,
  ) {
    this.logger.setContext(RulesEngineService.name);
  }

  async createRule(dto: CreateRuleDto, tenantId: string): Promise<RuleEntity> {
    this.logger.debug('createRule()', { name: dto.name, tenantId });
    const entity = this.rules.create({
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
      triggerEvent: dto.triggerEvent,
      conditions: dto.conditions as any[],
      actions: dto.actions as any[],
      priority: dto.priority ?? 0,
      status: 'ACTIVE',
    });
    try {
      return await this.rules.save(entity);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new AppError('DUPLICATE_RESOURCE', `Rule "${dto.name}" already exists for this tenant`);
      }
      throw err;
    }
  }

  async updateRule(id: string, dto: UpdateRuleDto, tenantId: string): Promise<RuleEntity> {
    this.logger.debug('updateRule()', { id, tenantId });
    const rule = await this.rules.findOne({ where: { id, tenantId } });
    if (!rule) throw new AppError('RESOURCE_NOT_FOUND', `Rule ${id} not found`);

    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.description !== undefined) rule.description = dto.description;
    if (dto.triggerEvent !== undefined) rule.triggerEvent = dto.triggerEvent;
    if (dto.conditions !== undefined) rule.conditions = dto.conditions as any[];
    if (dto.actions !== undefined) rule.actions = dto.actions as any[];
    if (dto.priority !== undefined) rule.priority = dto.priority;
    if (dto.enabled !== undefined) {
      rule.status = dto.enabled ? 'ACTIVE' : 'INACTIVE';
    }

    return this.rules.save(rule);
  }

  async deleteRule(id: string, tenantId: string): Promise<void> {
    this.logger.debug('deleteRule()', { id, tenantId });
    const rule = await this.rules.findOne({ where: { id, tenantId } });
    if (!rule) throw new AppError('RESOURCE_NOT_FOUND', `Rule ${id} not found`);
    await this.rules.remove(rule);
  }

  async listRules(tenantId: string): Promise<RuleEntity[]> {
    return this.rules.find({
      where: { tenantId },
      order: { priority: 'DESC', createdAt: 'DESC' },
    });
  }

  async toggleRule(id: string, tenantId: string): Promise<RuleEntity> {
    this.logger.debug('toggleRule()', { id, tenantId });
    const rule = await this.rules.findOne({ where: { id, tenantId } });
    if (!rule) throw new AppError('RESOURCE_NOT_FOUND', `Rule ${id} not found`);

    const newStatus = rule.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    rule.status = newStatus;
    const saved = await this.rules.save(rule);

    await this.outbox.append(
      `automation.rule.${newStatus === 'ACTIVE' ? 'activated' : 'deactivated'}`,
      { ruleId: id, name: rule.name, status: newStatus },
      tenantId,
    );

    return saved;
  }

  /** Fire-and-forget execution counter — used when rules engine evaluates a trigger */
  async incrementExecution(id: string): Promise<void> {
    try {
      await this.rules.increment({ id }, 'executionCount', 1);
      await this.rules.update({ id }, { lastTriggeredAt: new Date() });
    } catch (err) {
      this.logger.warn('incrementExecution failed', { id, err });
    }
  }
}
