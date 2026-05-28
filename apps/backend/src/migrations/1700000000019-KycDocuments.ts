/**
 * @file src/migrations/1700000000019-KycDocuments.ts
 * @module migrations
 * @description Creates kyc_documents table for document upload and review workflow
 * @author BharatERP
 * @created 2026-04-24
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class KycDocuments1700000000019 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kyc_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        user_id UUID NOT NULL,
        document_type VARCHAR(32) NOT NULL,
        s3_key TEXT NOT NULL DEFAULT '',
        original_filename VARCHAR(255) NOT NULL,
        mime_type VARCHAR(64) NOT NULL,
        file_size_bytes INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW',
        reviewer_id UUID,
        reviewed_at TIMESTAMPTZ,
        rejection_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_kyc_docs_tenant_user ON kyc_documents(tenant_id, user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_kyc_docs_status ON kyc_documents(status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS kyc_documents`);
  }
}
