/**
 * @file src/migrations/1700000000007-OmsCore.ts
 * @module migrations
 * @description Create OMS core tables: orders, executions, order_audit, position_snapshots
 * @author BharatERP
 * @created 2025-09-19
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class OmsCore1700000000007 implements MigrationInterface {
  name = 'OmsCore1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS orders (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id varchar(64) NOT NULL,
      account_id uuid NOT NULL,
      instrument_id uuid NOT NULL,
      side varchar(8) NOT NULL,
      type varchar(16) NOT NULL,
      quantity numeric(28,8) NOT NULL,
      price numeric(28,8),
      time_in_force varchar(16) NOT NULL DEFAULT 'DAY',
      status varchar(24) NOT NULL DEFAULT 'NEW',
      client_order_id varchar(64) NOT NULL,
      hold_ref varchar(128),
      meta jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_orders_tenant_account_status ON orders(tenant_id, account_id, status)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_client_id ON orders(tenant_id, client_order_id)`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS executions (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id varchar(64) NOT NULL,
      order_id uuid NOT NULL,
      account_id uuid NOT NULL,
      instrument_id uuid NOT NULL,
      quantity numeric(28,8) NOT NULL,
      price numeric(28,8) NOT NULL,
      fees numeric(28,8) NOT NULL DEFAULT 0,
      external_ref_id varchar(128) NOT NULL,
      meta jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_exec_tenant_order ON executions(tenant_id, order_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_exec_ref ON executions(tenant_id, external_ref_id)`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS order_audit (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id varchar(64) NOT NULL,
      order_id uuid NOT NULL,
      action varchar(24) NOT NULL,
      data jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_order_audit_order ON order_audit(tenant_id, order_id)`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS position_snapshots (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id varchar(64) NOT NULL,
      account_id uuid NOT NULL,
      instrument_id uuid NOT NULL,
      net_qty numeric(28,8) NOT NULL,
      avg_price numeric(28,8),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_pos_snap_tenant_account_instrument ON position_snapshots(tenant_id, account_id, instrument_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS position_snapshots`);
    await queryRunner.query(`DROP TABLE IF EXISTS order_audit`);
    await queryRunner.query(`DROP TABLE IF EXISTS executions`);
    await queryRunner.query(`DROP TABLE IF EXISTS orders`);
  }
}


