/**
 * @file src/migrations/1700000000017-RefreshTokenTenantId.ts
 * @module migrations
 * @description Add tenant_id to refresh_tokens for cross-tenant replay protection
 * @author BharatERP
 * @created 2026-04-24
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefreshTokenTenantId1700000000017 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS tenant_id varchar(64) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_refresh_tenant_user ON refresh_tokens(tenant_id, user_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_refresh_tenant_user`,
    );
    await queryRunner.query(
      `ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS tenant_id`,
    );
  }
}
