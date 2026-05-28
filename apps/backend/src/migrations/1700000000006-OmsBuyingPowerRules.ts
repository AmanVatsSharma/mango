/**
 * @file src/migrations/1700000000006-OmsBuyingPowerRules.ts
 * @module migrations
 * @description Create buying_power_rules table for OMS risk configs
 * @author BharatERP
 * @created 2025-09-19
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class OmsBuyingPowerRules1700000000006 implements MigrationInterface {
  name = 'OmsBuyingPowerRules1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS buying_power_rules (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id varchar(64) NOT NULL,
      segment varchar(16) NOT NULL,
      position_type varchar(16) NOT NULL,
      multiplier numeric(18,8) NOT NULL DEFAULT 1,
      maintenance_margin_rate numeric(18,8) NOT NULL DEFAULT 0.1,
      is_active boolean NOT NULL DEFAULT true,
      meta jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_bp_rules_tenant_segment_position ON buying_power_rules(tenant_id, segment, position_type)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS buying_power_rules`);
  }
}


