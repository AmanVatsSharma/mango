/**
 * @file src/migrations/1700000000011-OmsMarginAndBrokerage.ts
 * @module migrations
 * @description Create user_leverage_overrides and brokerage_rules tables
 * @author BharatERP
 * @created 2025-09-24
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class OmsMarginAndBrokerage1700000000011 implements MigrationInterface {
  name = 'OmsMarginAndBrokerage1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_leverage_overrides (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id varchar(64) NOT NULL,
        user_id uuid NOT NULL,
        segment varchar(16) NOT NULL,
        position_type varchar(16) NOT NULL,
        leverage_multiplier numeric(18,8) NOT NULL DEFAULT 1,
        valid_from timestamptz,
        valid_to timestamptz,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, user_id, segment, position_type)
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_leverage_overrides_tenant_user ON user_leverage_overrides(tenant_id, user_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS brokerage_rules (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id varchar(64) NOT NULL,
        applies_to varchar(8) NOT NULL,
        user_id uuid,
        segment varchar(16) NOT NULL,
        product varchar(16) NOT NULL,
        side varchar(8) NOT NULL DEFAULT 'BOTH',
        percent numeric(18,8) NOT NULL DEFAULT 0,
        per_order_flat numeric(18,8) NOT NULL DEFAULT 0,
        cap_per_order numeric(18,8),
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_brokerage_rules_tenant ON brokerage_rules(tenant_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS brokerage_rules`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_leverage_overrides`);
  }
}


