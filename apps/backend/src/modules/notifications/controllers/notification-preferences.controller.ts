/**
 * @file src/modules/notifications/controllers/notification-preferences.controller.ts
 * @module notifications
 * @description Notification preferences API for authenticated users
 * @author BharatERP
 * @created 2025-01-09
 */

import { Body, Controller, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { UpdateNotificationPreferencesDto } from '../dtos/update-notification-preferences.dto';
import { NotificationService } from '../services/notification.service';
import { AppLoggerService } from '../../../shared/logger';

@ApiTags('Notifications')
@Controller('notifications/preferences')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class NotificationPreferencesController {
  constructor(
    private readonly service: NotificationService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(NotificationPreferencesController.name);
  }

  @Patch()
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update notification preferences per category' })
  @ApiBody({ type: UpdateNotificationPreferencesDto })
  @ApiResponse({ status: 200, description: 'Updated preferences' })
  async update(
    @Body() dto: UpdateNotificationPreferencesDto,
    @Req() req: any,
  ) {
    this.logger.debug('PATCH /notifications/preferences', { userId: req.user.userId });
    return this.service.updatePreferences(req.user.userId, dto);
  }
}

