/**
 * @file src/migrations/1700000000013-DepositRequests.ts
 * @module migrations
 * @description Adds deposit_requests table for funding approvals
 * @author BharatERP
 * @created 2025-01-09
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class DepositRequests1700000000013 implements MigrationInterface {
  name = 'DepositRequests1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS deposit_requests (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id varchar(64) NOT NULL,
        user_id uuid NOT NULL,
        account_id uuid NOT NULL,
        amount numeric(28,8) NOT NULL,
        currency varchar(8) NOT NULL,
        external_ref_id varchar(128) NOT NULL,
        reference_note varchar(255),
        proof_url varchar(512),
        status varchar(24) NOT NULL DEFAULT 'PENDING',
        approved_by uuid,
        approved_at timestamptz,
        meta jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_deposits_external_ref ON deposit_requests(tenant_id, external_ref_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposit_requests(tenant_id, user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposit_requests(tenant_id, status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS deposit_requests`);
  }
}

