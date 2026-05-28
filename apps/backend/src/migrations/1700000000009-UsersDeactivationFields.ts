/**
 * @file src/migrations/1700000000009-UsersDeactivationFields.ts
 * @module migrations
 * @description Add deactivation fields to users table
 * @author BharatERP
 * @created 2025-09-24
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersDeactivationFields1700000000009 implements MigrationInterface {
  name = 'UsersDeactivationFields1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
        ADD COLUMN IF NOT EXISTS deactivated_reason varchar(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS deactivated_reason,
        DROP COLUMN IF EXISTS deactivated_at
    `);
  }
}


