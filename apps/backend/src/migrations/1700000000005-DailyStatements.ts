/**
 * @file src/migrations/1700000000005-DailyStatements.ts
 * @module migrations
 * @description Create daily_statements table
 * @author BharatERP
 * @created 2025-09-19
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class DailyStatements1700000000005 implements MigrationInterface {
  name = 'DailyStatements1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS daily_statements (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id varchar(64) NOT NULL,
      account_id uuid NOT NULL,
      date date NOT NULL,
      opening_cash numeric(28,8) NOT NULL DEFAULT 0,
      closing_cash numeric(28,8) NOT NULL DEFAULT 0,
      deposits numeric(28,8) NOT NULL DEFAULT 0,
      withdrawals numeric(28,8) NOT NULL DEFAULT 0,
      fees numeric(28,8) NOT NULL DEFAULT 0,
      realized_pnl numeric(28,8) NOT NULL DEFAULT 0,
      unrealized_pnl numeric(28,8) NOT NULL DEFAULT 0,
      equity numeric(28,8) NOT NULL DEFAULT 0,
      maintenance_margin numeric(28,8) NOT NULL DEFAULT 0,
      buying_power numeric(28,8) NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      UNIQUE (tenant_id, account_id, date)
    )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS daily_statements`);
  }
}
