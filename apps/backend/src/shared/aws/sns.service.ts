/**
 * @file src/shared/aws/sns.service.ts
 * @module shared
 * @description AWS SNS wrapper service for sending SMS
 * @author BharatERP
 * @created 2025-09-18
 */

import { Injectable } from '@nestjs/common';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { AppLoggerService } from '../logger';

@Injectable()
export class AwsSnsService {
  private readonly client: SNSClient;
  private readonly senderId?: string;

  constructor(private readonly logger: AppLoggerService) {
    this.logger.setContext(AwsSnsService.name);
    this.client = new SNSClient({ region: process.env.AWS_REGION });
    this.senderId = process.env.AWS_SNS_SENDER_ID;
  }

  async sendSms(phoneE164: string, message: string): Promise<void> {
    this.logger.debug(`Sending SMS to ${phoneE164}`);
    // In non-production or when AWS env is not configured, do not attempt real send
    const region = process.env.AWS_REGION;
    const hasAwsCreds = !!process.env.AWS_ACCESS_KEY_ID || !!process.env.AWS_PROFILE || !!process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
    const smsEnabled = (process.env.SMS_ENABLED || 'true') === 'true';
    if (!smsEnabled || !region || !hasAwsCreds) {
      this.logger.warn(
        `[DEV-ONLY] SMS disabled or AWS not configured. Skipping SNS send. Message for ${phoneE164}: ${message}`,
      );
      return;
    }
    await this.client.send(
      new PublishCommand({
        Message: message,
        PhoneNumber: phoneE164,
        MessageAttributes: this.senderId
          ? {
              'AWS.SNS.SMS.SenderID': {
                DataType: 'String',
                StringValue: this.senderId,
              },
            }
          : undefined,
      }),
    );
  }
}
