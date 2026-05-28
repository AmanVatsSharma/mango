/**
 * @file src/modules/developer-platform/controllers/developer-platform.controller.ts
 * @module developer-platform
 * @description Developer platform controller scaffold for API key operations
 * @author BharatERP
 * @created 2026-02-19
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { CreateApiKeyDto } from '../dtos/create-api-key.dto';
import { CreateWebhookEndpointDto } from '../dtos/create-webhook-endpoint.dto';
import { ApiKeyEntity } from '../entities/api-key.entity';
import { DeveloperPlatformService } from '../services/developer-platform.service';

@Controller('developer-platform')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class DeveloperPlatformController {
  constructor(private readonly developerPlatformService: DeveloperPlatformService) {}

  @Post('api-keys')
  @Permissions('developer-platform:write')
  async create(@Body() dto: CreateApiKeyDto): Promise<ApiKeyEntity> {
    return this.developerPlatformService.createApiKey(dto);
  }

  @Get('api-keys')
  @Permissions('developer-platform:read')
  async list(@Query('tenantId') tenantId: string): Promise<ApiKeyEntity[]> {
    return this.developerPlatformService.listApiKeys(tenantId);
  }

  @Get('api-keys/:id/status')
  @Permissions('developer-platform:read')
  async status(@Param('id') id: string): Promise<{ id: string; status: string } | null> {
    return this.developerPlatformService.getApiKeyStatus(id);
  }

  @Post('webhooks')
  @Permissions('developer-platform:webhooks')
  async createWebhook(
    @Body() dto: CreateWebhookEndpointDto,
  ): Promise<{ status: string; webhook: Record<string, unknown> }> {
    return this.developerPlatformService.registerWebhookEndpoint(dto);
  }
}
