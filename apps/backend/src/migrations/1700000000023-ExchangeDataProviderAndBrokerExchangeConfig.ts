/**
 * File:        apps/backend/src/migrations/1700000000023-ExchangeDataProviderAndBrokerExchangeConfig.ts
 * Module:      migrations
 * Purpose:     Adds data_provider_code to exchanges table and creates the
 *              broker_exchange_configs table for per-broker exchange access control.
 *              Seeds NSE, BSE, MCX with providerCode = 'KITE'.
 *
 * Exports:
 *   - ExchangeDataProviderAndBrokerExchangeConfig — MigrationInterface
 *
 * Depends on:
 *   - none (raw SQL migration)
 *
 * Side-effects:
 *   - ALTER TABLE exchanges (additive, nullable — safe on live traffic)
 *   - CREATE TABLE broker_exchange_configs (new table — safe)
 *   - INSERT INTO exchanges for NSE, BSE, MCX seed rows (ON CONFLICT DO UPDATE)
 *
 * Key invariants:
 *   - All DDL changes are additive or create new tables — no destructive changes
 *   - NSE/BSE/MCX seed rows use ON CONFLICT (code) DO UPDATE so re-running is safe
 *
 * Read order:
 *   1. up()   — apply
 *   2. down() — rollback
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-08
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExchangeDataProviderAndBrokerExchangeConfig1700000000023
  implements MigrationInterface
{
  name = 'ExchangeDataProviderAndBrokerExchangeConfig1700000000023';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add data_provider_code to exchanges
    await queryRunner.query(`
      ALTER TABLE "exchanges"
      ADD COLUMN IF NOT EXISTS "data_provider_code" varchar(32) DEFAULT NULL
    `);

    // 2. Create broker_exchange_configs
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "broker_exchange_configs" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "broker_id"        uuid NOT NULL,
        "exchange_code"    varchar(16) NOT NULL,
        "enabled"          boolean NOT NULL DEFAULT false,
        "connector_family" varchar(64) DEFAULT NULL,
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        "updated_at"       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_broker_exchange_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bec_broker_exchange" UNIQUE ("broker_id", "exchange_code")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bec_broker_id"
      ON "broker_exchange_configs" ("broker_id")
    `);

    // 3. Seed Indian exchanges with Kite as data provider
    await queryRunner.query(`
      INSERT INTO "exchanges" ("code", "name", "country", "timezone", "data_provider_code")
      VALUES
        ('NSE',  'National Stock Exchange of India',  'India', 'Asia/Kolkata', 'KITE'),
        ('BSE',  'Bombay Stock Exchange',             'India', 'Asia/Kolkata', 'KITE'),
        ('MCX',  'Multi Commodity Exchange of India', 'India', 'Asia/Kolkata', 'KITE'),
        ('NCDEX','National Commodity & Derivatives Exchange','India','Asia/Kolkata','KITE')
      ON CONFLICT ("code") DO UPDATE
        SET "data_provider_code" = EXCLUDED."data_provider_code"
    `);

    // 4. Seed common international exchanges with GENERIC_REST fallback
    await queryRunner.query(`
      INSERT INTO "exchanges" ("code", "name", "country", "timezone", "data_provider_code")
      VALUES
        ('NASDAQ', 'NASDAQ',              'USA',     'America/New_York', 'GENERIC_REST'),
        ('NYSE',   'New York Stock Exchange','USA',  'America/New_York', 'GENERIC_REST'),
        ('LSE',    'London Stock Exchange','UK',     'Europe/London',    'GENERIC_REST'),
        ('BINANCE','Binance',             'Global',  'UTC',              'GENERIC_REST')
      ON CONFLICT ("code") DO UPDATE
        SET "data_provider_code" = EXCLUDED."data_provider_code"
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bec_broker_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "broker_exchange_configs"`);
    await queryRunner.query(`
      ALTER TABLE "exchanges"
      DROP COLUMN IF EXISTS "data_provider_code"
    `);
  }
}
