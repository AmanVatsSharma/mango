/**
 * @file src/migrations/1700000000014-Notifications.ts
 * @module migrations
 * @description Creates notifications and notification_preferences tables
 * @author BharatERP
 * @created 2025-01-09
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class Notifications1700000000014 implements MigrationInterface {
  name = 'Notifications1700000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id varchar(64) NOT NULL,
        user_id uuid NOT NULL,
        type varchar(64) NOT NULL,
        channel varchar(16) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'pending',
        title varchar(160) NOT NULL,
        body text NOT NULL,
        meta jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(tenant_id, user_id, created_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id varchar(64) NOT NULL,
        user_id uuid NOT NULL,
        category varchar(64) NOT NULL,
        email boolean NOT NULL DEFAULT true,
        sms boolean NOT NULL DEFAULT false,
        push boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_pref_user_category ON notification_preferences(tenant_id, user_id, category)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_notification_pref_user ON notification_preferences(tenant_id, user_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notification_preferences`);
    await queryRunner.query(`DROP TABLE IF EXISTS notifications`);
  }
}

