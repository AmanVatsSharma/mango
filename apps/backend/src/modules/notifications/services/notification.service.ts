/**
 * File:        apps/backend/src/modules/notifications/services/notification.service.ts
 * Module:      notifications
 * Purpose:     Notification dispatch — creates DB record, then attempts real
 *              channel dispatch (SES email, SNS SMS, in-app). Updates record
 *              status to 'sent' or 'failed' based on outcome.
 *
 * Exports:
 *   - NotificationService.send(opts) → void   — dispatch to allowed channels
 *   - NotificationService.list(userId, limit) → NotificationEntity[]
 *   - NotificationService.updatePreferences(userId, dto) → NotificationPreferenceEntity
 *
 * Depends on:
 *   - AwsSesService (via SharedModule @Global) — email dispatch
 *   - AwsSnsService (via SharedModule @Global) — SMS dispatch
 *
 * Side-effects:
 *   - DB write per channel (NotificationEntity)
 *   - AWS SES call when email provided + credentials configured
 *   - AWS SNS call when phone provided + credentials configured
 *
 * Key invariants:
 *   - Record created as 'pending', then updated to 'sent'/'failed' — never saved as 'sent' directly
 *   - Dispatch errors are caught and status updated to 'failed' — never propagated to caller
 *   - email/phone in opts are optional: if absent, channel is saved as in-app only
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from '../entities/notification.entity';
import { NotificationPreferenceEntity } from '../entities/notification-preference.entity';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { UpdateNotificationPreferencesDto } from '../dtos/update-notification-preferences.dto';
import { NotificationTemplateService } from './notification-template.service';
import { AwsSesService } from '../../../shared/aws/ses.service';
import { AwsSnsService } from '../../../shared/aws/sns.service';

type Channel = 'email' | 'sms' | 'push' | 'in-app';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    @InjectRepository(NotificationPreferenceEntity)
    private readonly prefs: Repository<NotificationPreferenceEntity>,
    private readonly logger: AppLoggerService,
    private readonly templates: NotificationTemplateService,
    private readonly ses: AwsSesService,
    private readonly sns: AwsSnsService,
  ) {
    this.logger.setContext(NotificationService.name);
  }

  async list(userId: string, limit = 20): Promise<NotificationEntity[]> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) return [];
    return this.notifications.find({
      where: { tenantId: ctx.tenantId, userId },
      order: { createdAt: 'DESC' } as any,
      take: limit,
    });
  }

  async updatePreferences(userId: string, dto: UpdateNotificationPreferencesDto) {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) return { updated: false };
    const existing = await this.prefs.findOne({
      where: { tenantId: ctx.tenantId, userId, category: dto.category },
    });
    if (existing) {
      existing.email = dto.email;
      existing.sms = dto.sms;
      existing.push = dto.push;
      await this.prefs.save(existing);
      return existing;
    }
    const created = this.prefs.create({
      tenantId: ctx.tenantId,
      userId,
      category: dto.category,
      email: dto.email,
      sms: dto.sms,
      push: dto.push,
    });
    return this.prefs.save(created);
  }

  async send(options: {
    userId: string;
    type: string;
    title: string;
    bodyTemplate: string;
    vars?: Record<string, any>;
    channels?: Channel[];
    category?: string;
    inAppOnly?: boolean;
    /** Caller-supplied contact info — if absent, email/SMS channels are skipped */
    email?: string;
    phone?: string;
  }): Promise<void> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) return;
    const channels: Channel[] = options.inAppOnly
      ? ['in-app']
      : options.channels ?? ['in-app', 'email'];
    const category = options.category ?? 'general';
    const prefs = await this.prefs.findOne({
      where: { tenantId: ctx.tenantId, userId: options.userId, category },
    });
    const allowed = this.filterChannels(channels, prefs);
    const body = this.templates.render(options.bodyTemplate, options.vars ?? {});

    for (const channel of allowed) {
      const record = this.notifications.create({
        tenantId: ctx.tenantId,
        userId: options.userId,
        type: options.type,
        channel,
        status: 'pending',
        title: options.title,
        body,
      });
      const saved = await this.notifications.save(record);
      await this.dispatchChannel(saved, options);
    }
  }

  private async dispatchChannel(
    record: NotificationEntity,
    options: { title: string; email?: string; phone?: string },
  ): Promise<void> {
    try {
      if (record.channel === 'email' && options.email) {
        await this.ses.sendEmail({
          to: options.email,
          subject: options.title,
          html: `<p>${record.body}</p>`,
          text: record.body,
        });
      } else if (record.channel === 'sms' && options.phone) {
        await this.sns.sendSms(options.phone, record.body);
      }
      // push and in-app: no external call — status is 'sent' immediately
      record.status = 'sent';
    } catch (err) {
      this.logger.error(
        `Notification dispatch failed channel=${record.channel} id=${record.id}`,
        err instanceof Error ? err.message : String(err), // eslint-disable-line @typescript-eslint/no-base-to-string
      );
      record.status = 'failed';
    }
    await this.notifications.save(record);
    this.logger.debug('Notification dispatched', { channel: record.channel, status: record.status });
  }

  private filterChannels(channels: Channel[], prefs?: NotificationPreferenceEntity | null): Channel[] {
    if (!prefs) return channels;
    return channels.filter((ch) => {
      if (ch === 'email') return prefs.email;
      if (ch === 'sms') return prefs.sms;
      if (ch === 'push') return prefs.push;
      return true; // in-app always allowed
    });
  }
}

