/**
 * @file src/modules/notifications/services/notification-template.service.ts
 * @module notifications
 * @description Simple template resolver for notifications (stubbed with inline templates)
 * @author BharatERP
 * @created 2025-01-09
 */

import { Injectable } from '@nestjs/common';

type TemplateVars = Record<string, string | number | boolean | null | undefined>;

@Injectable()
export class NotificationTemplateService {
  render(template: string, vars: TemplateVars): string {
    return template.replace(/{{(.*?)}}/g, (_, key) => {
      const v = vars[key.trim()];
      return v === undefined || v === null ? '' : String(v);
    });
  }
}

