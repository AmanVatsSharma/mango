/**
 * @file src/migrations/1700000000004-AccountsAndLedgers.ts
 * @module migrations
 * @description Create accounts, cash_ledger_entries, position_ledger_entries, holds, buying_power_rules, withdrawal_requests
 * @author BharatERP
 * @created 2025-09-19
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountsAndLedgers1700000000004 implements MigrationInterface {
  name = 'AccountsAndLedgers1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS accounts (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id varchar(64) NOT NULL,
      user_id uuid NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'ACTIVE',
      base_currency varchar(8) NOT NULL DEFAULT 'INR',
      preferences jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(tenant_id, user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status)`,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS cash_ledger_entries (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id varchar(64) NOT NULL,
      account_id uuid NOT NULL,
      amount numeric(28,8) NOT NULL,
      currency varchar(8) NOT NULL,
      direction varchar(8) NOT NULL,
      kind varchar(24) NOT NULL,
      external_ref_id varchar(128) NOT NULL,
      meta jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_cash_ledger_account_created ON cash_ledger_entries(tenant_id, account_id, created_at)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_cash_ledger_ref ON cash_ledger_entries(tenant_id, external_ref_id)`,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS position_ledger_entries (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id varchar(64) NOT NULL,
      account_id uuid NOT NULL,
      instrument_id uuid NOT NULL,
      quantity_delta numeric(28,8) NOT NULL,
      price numeric(28,8) NOT NULL,
      fees numeric(28,8) NOT NULL DEFAULT 0,
      side varchar(8) NOT NULL,
      external_ref_id varchar(128) NOT NULL,
      meta jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_pos_ledger_account_instrument_created ON position_ledger_entries(tenant_id, account_id, instrument_id, created_at)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_ledger_ref ON position_ledger_entries(tenant_id, external_ref_id)`,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS holds (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id varchar(64) NOT NULL,
      account_id uuid NOT NULL,
      reason varchar(16) NOT NULL,
      amount numeric(28,8) NOT NULL,
      currency varchar(8) NOT NULL,
      state varchar(16) NOT NULL DEFAULT 'ACTIVE',
      external_ref_id varchar(128) NOT NULL,
      meta jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      released_at TIMESTAMP WITH TIME ZONE
    )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_holds_account_state ON holds(tenant_id, account_id, state)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_holds_ref ON holds(tenant_id, external_ref_id)`,
    );

    /* buying_power_rules moved to OMS module migration later */

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id varchar(64) NOT NULL,
      account_id uuid NOT NULL,
      amount numeric(28,8) NOT NULL,
      currency varchar(8) NOT NULL,
      state varchar(16) NOT NULL DEFAULT 'PENDING',
      external_ref_id varchar(128),
      meta jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_withdrawal_account_state ON withdrawal_requests(tenant_id, account_id, state)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS withdrawal_requests`);
    /* buying_power_rules dropped by OMS migration */
    await queryRunner.query(`DROP TABLE IF EXISTS holds`);
    await queryRunner.query(`DROP TABLE IF EXISTS position_ledger_entries`);
    await queryRunner.query(`DROP TABLE IF EXISTS cash_ledger_entries`);
    await queryRunner.query(`DROP TABLE IF EXISTS accounts`);
  }
}
