/**
 * @file src/modules/developer-platform/services/developer-platform.service.ts
 * @module developer-platform
 * @description Developer platform service scaffold for API key management
 * @author BharatERP
 * @created 2026-02-19
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { CreateApiKeyDto } from '../dtos/create-api-key.dto';
import { CreateWebhookEndpointDto } from '../dtos/create-webhook-endpoint.dto';
import { ApiKeyEntity } from '../entities/api-key.entity';

@Injectable()
export class DeveloperPlatformService {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly apiKeys: Repository<ApiKeyEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(DeveloperPlatformService.name);
  }

  async createApiKey(dto: CreateApiKeyDto): Promise<ApiKeyEntity> {
    this.logger.debug('createApiKey:start', dto);
    const saved = await this.apiKeys.save(this.apiKeys.create(dto));
    this.logger.debug('createApiKey:end', { apiKeyId: saved.id });
    return saved;
  }

  async listApiKeys(tenantId: string): Promise<ApiKeyEntity[]> {
    return this.apiKeys.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async getApiKeyStatus(id: string): Promise<{ id: string; status: string } | null> {
    const key = await this.apiKeys.findOne({ where: { id }, select: ['id', 'status'] });
    return key ? { id: key.id, status: key.status } : null;
  }

  async registerWebhookEndpoint(
    dto: CreateWebhookEndpointDto,
  ): Promise<{ status: string; webhook: Record<string, unknown> }> {
    const webhook = {
      id: `wh-${Date.now()}`,
      ...dto,
      status: 'REGISTERED',
    };
    const audit = this.auditEnvelope('WEBHOOK_REGISTERED', webhook.id, webhook);
    this.logger.debug('webhook endpoint placeholder registered', audit);
    return { status: 'REGISTERED', webhook };
  }

  private auditEnvelope(
    action: string,
    targetId: string,
    details: Record<string, unknown>,
  ): Record<string, unknown> {
    const ctx = getRequestContext();
    return {
      action,
      targetId,
      details,
      requestId: ctx?.requestId,
      actorUserId: ctx?.userId,
      tenantId: ctx?.tenantId,
      at: new Date().toISOString(),
    };
  }
}
