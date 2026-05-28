/**
 * File:        apps/backend/src/migrations/1700000000021-IbCommission.ts
 * Module:      migrations
 * Purpose:     Creates IB relationship hierarchy, commission rules, and commission ledger tables.
 *
 * Exports:
 *   - IbCommission1700000000021 — MigrationInterface
 *
 * Depends on: none
 * Side-effects: DDL — creates 3 tables with indexes and unique constraints
 * Key invariants:
 *   - ib_commission_ledger has unique constraint on (tenant_id, execution_id, ib_user_id)
 *     for idempotent re-processing
 *   - ib_relationships: one IB can appear once per tenant (unique tenant_id, ib_user_id)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class IbCommission1700000000021 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ib_relationships (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id         UUID NOT NULL,
        ib_user_id        UUID NOT NULL,
        parent_ib_user_id UUID,
        level             INT NOT NULL DEFAULT 1,
        is_active         BOOLEAN NOT NULL DEFAULT TRUE,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ux_ib_tenant_user UNIQUE (tenant_id, ib_user_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ib_rel_tenant ON ib_relationships (tenant_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ib_commission_rules (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id        UUID NOT NULL,
        ib_user_id       UUID NOT NULL,
        commission_type  VARCHAR(32) NOT NULL,
        rate             NUMERIC(18, 8) NOT NULL,
        instrument_group VARCHAR(64),
        is_active        BOOLEAN NOT NULL DEFAULT TRUE,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ib_rule_tenant_ib
        ON ib_commission_rules (tenant_id, ib_user_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ib_commission_ledger (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id        UUID NOT NULL,
        ib_user_id       UUID NOT NULL,
        execution_id     UUID NOT NULL,
        account_id       UUID NOT NULL,
        level            INT NOT NULL,
        commission_type  VARCHAR(32) NOT NULL,
        amount           NUMERIC(28, 8) NOT NULL,
        currency         VARCHAR(8) NOT NULL,
        status           VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        period_key       VARCHAR(32),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ux_ib_ledger_exec_ib UNIQUE (tenant_id, execution_id, ib_user_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ib_ledger_tenant_ib
        ON ib_commission_ledger (tenant_id, ib_user_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ib_ledger_status
        ON ib_commission_ledger (tenant_id, status)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_ib_ledger_status');
    await queryRunner.query('DROP INDEX IF EXISTS idx_ib_ledger_tenant_ib');
    await queryRunner.query('DROP TABLE IF EXISTS ib_commission_ledger');
    await queryRunner.query('DROP INDEX IF EXISTS idx_ib_rule_tenant_ib');
    await queryRunner.query('DROP TABLE IF EXISTS ib_commission_rules');
    await queryRunner.query('DROP INDEX IF EXISTS idx_ib_rel_tenant');
    await queryRunner.query('DROP TABLE IF EXISTS ib_relationships');
  }
}
