/**
 * @file src/migrations/1700000000008-UsersEnterpriseFields.ts
 * @module migrations
 * @description Add enterprise-grade fields to users table
 * @author BharatERP
 * @created 2025-09-24
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersEnterpriseFields1700000000008 implements MigrationInterface {
  name = 'UsersEnterpriseFields1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS name varchar(160),
        ADD COLUMN IF NOT EXISTS country_code varchar(2),
        ADD COLUMN IF NOT EXISTS date_of_birth date,
        ADD COLUMN IF NOT EXISTS kyc_status varchar(24) NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS tax_id varchar(64),
        ADD COLUMN IF NOT EXISTS address jsonb,
        ADD COLUMN IF NOT EXISTS preferences jsonb,
        ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
        ADD COLUMN IF NOT EXISTS last_password_change_at timestamptz,
        ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS pep_flag boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS aml_flag boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS tax_residency_country varchar(2),
        ADD COLUMN IF NOT EXISTS fatca_status varchar(24),
        ADD COLUMN IF NOT EXISTS primary_bank_account_masked varchar(64),
        ADD COLUMN IF NOT EXISTS referral_code varchar(32),
        ADD COLUMN IF NOT EXISTS referral_source varchar(64),
        ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS accepted_terms_at,
        DROP COLUMN IF EXISTS referral_source,
        DROP COLUMN IF EXISTS referral_code,
        DROP COLUMN IF EXISTS primary_bank_account_masked,
        DROP COLUMN IF EXISTS fatca_status,
        DROP COLUMN IF EXISTS tax_residency_country,
        DROP COLUMN IF EXISTS aml_flag,
        DROP COLUMN IF EXISTS pep_flag,
        DROP COLUMN IF EXISTS marketing_opt_in,
        DROP COLUMN IF EXISTS last_password_change_at,
        DROP COLUMN IF EXISTS last_login_at,
        DROP COLUMN IF EXISTS is_locked,
        DROP COLUMN IF EXISTS is_active,
        DROP COLUMN IF EXISTS preferences,
        DROP COLUMN IF EXISTS address,
        DROP COLUMN IF EXISTS tax_id,
        DROP COLUMN IF EXISTS kyc_status,
        DROP COLUMN IF EXISTS date_of_birth,
        DROP COLUMN IF EXISTS country_code,
        DROP COLUMN IF EXISTS name
    `);
  }
}


