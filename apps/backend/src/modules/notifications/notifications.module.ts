/**
 * @file src/modules/notifications/notifications.module.ts
 * @module notifications
 * @description Notifications module providing dispatch and preferences APIs
 * @author BharatERP
 * @created 2025-01-09
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationPreferenceEntity } from './entities/notification-preference.entity';
import { NotificationService } from './services/notification.service';
import { NotificationTemplateService } from './services/notification-template.service';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationPreferencesController } from './controllers/notification-preferences.controller';
import { NotificationsResolver } from './notifications.resolver';
import { RbacModule } from '../rbac/rbac.module';
import { ObservabilityModule } from '../../shared/observability/observability.module';

@Module({
  imports: [
    SharedModule,
    TypeOrmModule.forFeature([NotificationEntity, NotificationPreferenceEntity]),
    RbacModule,
    ObservabilityModule,
  ],
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [NotificationService, NotificationTemplateService, NotificationsResolver],
  exports: [NotificationService],
})
export class NotificationsModule {}

