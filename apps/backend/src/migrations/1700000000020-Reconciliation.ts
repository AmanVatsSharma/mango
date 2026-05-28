/**
 * File:        apps/backend/src/migrations/1700000000020-Reconciliation.ts
 * Module:      migrations
 * Purpose:     Creates lp_statement_lines table and enhances reconciliation_breaks with
 *              statementDate, externalRef, internalRef, isAging, resolvedAt columns.
 *
 * Exports:
 *   - Reconciliation1700000000020 — MigrationInterface
 *
 * Depends on: none
 * Side-effects: DDL — creates table, adds columns, adds indexes
 * Key invariants:
 *   - lp_statement_lines has unique constraint on (tenant_id, statement_date, external_trade_id)
 *   - reconciliation_breaks gets new nullable columns (safe to add to existing table)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class Reconciliation1700000000020 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS lp_statement_lines (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID NOT NULL,
        statement_date  DATE NOT NULL,
        external_trade_id VARCHAR(128) NOT NULL,
        lp_account_id   VARCHAR(128),
        symbol          VARCHAR(64) NOT NULL,
        quantity        NUMERIC(28, 8) NOT NULL,
        price           NUMERIC(28, 8) NOT NULL,
        side            VARCHAR(8) NOT NULL,
        imported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ux_lp_stmt_ext_trade UNIQUE (tenant_id, statement_date, external_trade_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_lp_stmt_tenant_date
        ON lp_statement_lines (tenant_id, statement_date)
    `);

    await queryRunner.query(`
      ALTER TABLE reconciliation_breaks
        ADD COLUMN IF NOT EXISTS statement_date  DATE,
        ADD COLUMN IF NOT EXISTS external_ref    VARCHAR(128),
        ADD COLUMN IF NOT EXISTS internal_ref    VARCHAR(128),
        ADD COLUMN IF NOT EXISTS is_aging        BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS resolved_at     TIMESTAMPTZ
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_recon_break_tenant_date
        ON reconciliation_breaks (tenant_id, statement_date)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_recon_break_status
        ON reconciliation_breaks (tenant_id, status)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_recon_break_status');
    await queryRunner.query('DROP INDEX IF EXISTS idx_recon_break_tenant_date');
    await queryRunner.query(`
      ALTER TABLE reconciliation_breaks
        DROP COLUMN IF EXISTS statement_date,
        DROP COLUMN IF EXISTS external_ref,
        DROP COLUMN IF EXISTS internal_ref,
        DROP COLUMN IF EXISTS is_aging,
        DROP COLUMN IF EXISTS resolved_at
    `);
    await queryRunner.query('DROP INDEX IF EXISTS idx_lp_stmt_tenant_date');
    await queryRunner.query('DROP TABLE IF EXISTS lp_statement_lines');
  }
}
