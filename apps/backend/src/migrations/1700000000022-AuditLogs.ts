/**
 * File:        apps/backend/src/migrations/1700000000022-AuditLogs.ts
 * Module:      migrations
 * Purpose:     Creates the immutable audit_logs table with HMAC signature column
 *              and targeted indexes for regulator query patterns.
 *
 * Exports:
 *   - AuditLogs1700000000022 — MigrationInterface
 *
 * Depends on: none
 * Side-effects: DDL — creates table with 4 indexes
 * Key invariants:
 *   - No updated_at column — append-only; records are never modified
 *   - hmac_signature is VARCHAR(128) for SHA-256 hex (64 chars) with growth room
 *   - before_state / after_state stored as JSONB for structured diff queries
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditLogs1700000000022 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID NOT NULL,
        actor_id        VARCHAR(128),
        action          VARCHAR(128) NOT NULL,
        resource_type   VARCHAR(64),
        resource_id     VARCHAR(128),
        before_state    JSONB,
        after_state     JSONB,
        ip_address      INET,
        request_id      VARCHAR(64),
        hmac_signature  VARCHAR(128) NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_tenant_actor
        ON audit_logs (tenant_id, actor_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_tenant_resource
        ON audit_logs (tenant_id, resource_type, resource_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_tenant_action
        ON audit_logs (tenant_id, action)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_created_at
        ON audit_logs (tenant_id, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_audit_created_at');
    await queryRunner.query('DROP INDEX IF EXISTS idx_audit_tenant_action');
    await queryRunner.query('DROP INDEX IF EXISTS idx_audit_tenant_resource');
    await queryRunner.query('DROP INDEX IF EXISTS idx_audit_tenant_actor');
    await queryRunner.query('DROP TABLE IF EXISTS audit_logs');
  }
}
