/**
 * @file src/migrations/1700000000016-AccountType.ts
 * @module migrations
 * @description Add account_type column to accounts for LIVE/DEMO discrimination
 * @author BharatERP
 * @created 2026-03-15
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountType1700000000016 implements MigrationInterface {
  name = 'AccountType1700000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_type varchar(16) NOT NULL DEFAULT 'LIVE'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_accounts_tenant_user_type ON accounts(tenant_id, user_id, account_type)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_accounts_tenant_user_type`);
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS account_type`);
  }
}
