/**
 * @file src/modules/corporate-actions/services/corporate-actions.service.ts
 * @module corporate-actions
 * @description Corporate actions service scaffold for event ingestion and listing
 * @author BharatERP
 * @created 2026-02-17
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { CreateCorporateActionDto } from '../dtos/create-corporate-action.dto';
import { CorporateActionEntity } from '../entities/corporate-action.entity';

@Injectable()
export class CorporateActionsService {
  constructor(
    @InjectRepository(CorporateActionEntity)
    private readonly actions: Repository<CorporateActionEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(CorporateActionsService.name);
  }

  async createAction(dto: CreateCorporateActionDto): Promise<CorporateActionEntity> {
    this.logger.debug('createAction:start', dto);
    const saved = await this.actions.save(this.actions.create(dto));
    this.logger.debug('createAction:end', { corporateActionId: saved.id });
    return saved;
  }

  async listActions(tenantId: string): Promise<CorporateActionEntity[]> {
    return this.actions.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }
}
