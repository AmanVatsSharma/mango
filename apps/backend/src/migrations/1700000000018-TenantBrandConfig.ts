/**
 * @file src/migrations/1700000000018-TenantBrandConfig.ts
 * @module migrations
 * @description Creates tenant_brand_configs table for white-label branding per tenant
 * @author BharatERP
 * @created 2026-04-24
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantBrandConfig1700000000018 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_brand_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL UNIQUE,
        primary_color VARCHAR(32),
        logo_url TEXT,
        favicon_url TEXT,
        app_name VARCHAR(128),
        custom_domain VARCHAR(255),
        support_email VARCHAR(255),
        features JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_brand_config_tenant ON tenant_brand_configs(tenant_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_brand_config_domain ON tenant_brand_configs(custom_domain) WHERE custom_domain IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_brand_configs`);
  }
}
