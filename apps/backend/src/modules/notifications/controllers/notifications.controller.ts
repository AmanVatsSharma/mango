/**
 * @file src/modules/notifications/controllers/notifications.controller.ts
 * @module notifications
 * @description In-app notifications listing
 * @author BharatERP
 * @created 2025-01-09
 */

import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { NotificationService } from '../services/notification.service';
import { AppLoggerService } from '../../../shared/logger';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class NotificationsController {
  constructor(
    private readonly service: NotificationService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(NotificationsController.name);
  }

  @Get()
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List notifications for current user' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Notifications list' })
  async list(@Req() req: any, @Query('limit') limit?: string) {
    const take = limit ? Math.min(parseInt(limit, 10) || 20, 100) : 20;
    this.logger.debug('GET /notifications', { userId: req.user.userId, take });
    return this.service.list(req.user.userId, take);
  }
}

