/**
 * File:        apps/backend/src/shared/aws/ses.service.ts
 * Module:      shared · AWS
 * Purpose:     Thin wrapper around AWS SES for transactional email dispatch.
 *              Mirrors AwsSnsService graceful-fallback pattern — silently skips
 *              when AWS credentials are absent (dev/test environments).
 *
 * Exports:
 *   - AwsSesService                          — injectable email service
 *   - AwsSesService.sendEmail(opts) → void  — send single transactional email
 *
 * Depends on:
 *   - @aws-sdk/client-ses — AWS SES SDK v3
 *   - AppLoggerService    — structured logging
 *
 * Side-effects:
 *   - HTTP call to AWS SES endpoint when credentials + EMAIL_ENABLED=true
 *
 * Key invariants:
 *   - EMAIL_FROM_ADDRESS env var must be a SES-verified sender address in prod
 *   - Falls back to log-only when AWS_ACCESS_KEY_ID / AWS_PROFILE / IRSA not set
 *
 * Read order:
 *   1. sendEmail() — only public method; all env checks live here
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Injectable } from '@nestjs/common';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { AppLoggerService } from '../logger';

export interface SesEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromAddress?: string;
}

@Injectable()
export class AwsSesService {
  private readonly client: SESClient;
  private readonly defaultFrom: string;

  constructor(private readonly logger: AppLoggerService) {
    this.logger.setContext(AwsSesService.name);
    this.client = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.defaultFrom = process.env.EMAIL_FROM_ADDRESS || 'noreply@obsidian.io';
  }

  async sendEmail(opts: SesEmailOptions): Promise<void> {
    const region = process.env.AWS_REGION;
    const hasAwsCreds =
      !!process.env.AWS_ACCESS_KEY_ID ||
      !!process.env.AWS_PROFILE ||
      !!process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
    const emailEnabled = (process.env.EMAIL_ENABLED ?? 'true') === 'true';

    if (!emailEnabled || !region || !hasAwsCreds) {
      this.logger.warn(
        `[DEV-ONLY] Email disabled or AWS not configured. Skipping SES send. ` +
          `Subject: "${opts.subject}" → ${Array.isArray(opts.to) ? opts.to.join(',') : opts.to}`,
      );
      return;
    }

    const toAddresses = Array.isArray(opts.to) ? opts.to : [opts.to];
    const from = opts.fromAddress ?? this.defaultFrom;

    await this.client.send(
      new SendEmailCommand({
        Source: from,
        Destination: { ToAddresses: toAddresses },
        Message: {
          Subject: { Data: opts.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: opts.html, Charset: 'UTF-8' },
            ...(opts.text ? { Text: { Data: opts.text, Charset: 'UTF-8' } } : {}),
          },
        },
      }),
    );

    this.logger.debug('SES email sent', { to: toAddresses, subject: opts.subject });
  }
}
