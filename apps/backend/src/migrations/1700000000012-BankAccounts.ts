/**
 * @file src/migrations/1700000000012-BankAccounts.ts
 * @module migrations
 * @description Adds bank_accounts table for funding flows
 * @author BharatERP
 * @created 2025-01-09
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankAccounts1700000000012 implements MigrationInterface {
  name = 'BankAccounts1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id varchar(64) NOT NULL,
        user_id uuid NOT NULL,
        account_id uuid,
        holder_name varchar(128) NOT NULL,
        bank_name varchar(128) NOT NULL,
        account_number varchar(64) NOT NULL,
        account_number_masked varchar(64) NOT NULL,
        ifsc_code varchar(16) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'PENDING_VERIFICATION',
        is_primary boolean NOT NULL DEFAULT false,
        verification_meta jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_bank_accounts_unique ON bank_accounts(tenant_id, user_id, account_number)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_bank_accounts_user ON bank_accounts(tenant_id, user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_bank_accounts_primary ON bank_accounts(tenant_id, user_id, is_primary)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS bank_accounts`);
  }
}

