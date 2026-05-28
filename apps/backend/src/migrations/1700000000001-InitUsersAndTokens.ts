/**
 * @file src/migrations/1700000000001-InitUsersAndTokens.ts
 * @module migrations
 * @description Initial migration for users and refresh_tokens tables
 * @author BharatERP
 * @created 2025-09-18
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitUsersAndTokens1700000000001 implements MigrationInterface {
  name = 'InitUsersAndTokens1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id varchar(64) NOT NULL,
        mobile_e164 varchar(20) NOT NULL,
        email varchar(320),
        password_hash varchar(255) NOT NULL,
        is_mobile_verified boolean NOT NULL DEFAULT false,
        is_email_verified boolean NOT NULL DEFAULT false,
        profile jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_mobile_uq ON users(tenant_id, mobile_e164)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_users_tenant_mobile ON users(tenant_id, mobile_e164)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL,
        token_id varchar(64) NOT NULL,
        hashed_token varchar(255) NOT NULL,
        expires_at timestamptz NOT NULL,
        device_info varchar(64),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
