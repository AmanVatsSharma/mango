/**
 * @file src/migrations/1700000000010-OmsOrdersExternalRef.ts
 * @module migrations
 * @description Add external_ref_id to orders and unique (tenant_id, external_ref_id)
 * @author BharatERP
 * @created 2025-09-24
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class OmsOrdersExternalRef1700000000010 implements MigrationInterface {
  name = 'OmsOrdersExternalRef1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_ref_id varchar(128) NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_external_ref ON orders(tenant_id, external_ref_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS ux_orders_external_ref`,
    );
    await queryRunner.query(
      `ALTER TABLE orders DROP COLUMN IF EXISTS external_ref_id`,
    );
  }
}


