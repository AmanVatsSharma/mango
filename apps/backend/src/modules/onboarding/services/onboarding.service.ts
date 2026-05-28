/**
 * @file src/modules/onboarding/services/onboarding.service.ts
 * @module onboarding
 * @description Onboarding profile service for KYC workflow scaffolding
 * @author BharatERP
 * @created 2026-02-17
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { UpsertOnboardingProfileDto } from '../dtos/upsert-onboarding-profile.dto';
import { OnboardingProfileEntity } from '../entities/onboarding-profile.entity';

@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(OnboardingProfileEntity)
    private readonly profiles: Repository<OnboardingProfileEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(OnboardingService.name);
  }

  async upsertProfile(dto: UpsertOnboardingProfileDto): Promise<OnboardingProfileEntity> {
    this.logger.debug('upsertProfile:start', dto);
    const existing = await this.profiles.findOne({
      where: { tenantId: dto.tenantId, userId: dto.userId },
    });
    const entity = this.profiles.create({
      ...(existing ?? {}),
      ...dto,
    });
    const saved = await this.profiles.save(entity);
    this.logger.debug('upsertProfile:end', { profileId: saved.id });
    return saved;
  }

  async listProfiles(tenantId: string): Promise<OnboardingProfileEntity[]> {
    this.logger.debug('listProfiles:start', { tenantId });
    return this.profiles.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }
}
