/**
 * @file src/migrations/1700000000003-MarketTables.ts
 * @module migrations
 * @description Market tables: exchanges, instruments, watchlists, watchlist_items
 * @author BharatERP
 * @created 2025-09-19
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class MarketTables1700000000003 implements MigrationInterface {
  name = 'MarketTables1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS exchanges (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        code varchar(16) NOT NULL,
        name varchar(128) NOT NULL,
        country varchar(64),
        timezone varchar(64),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS exchanges_code_uq ON exchanges(code)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_exchanges_code ON exchanges(code)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS instruments (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        exchange_code varchar(16) NOT NULL,
        symbol varchar(64) NOT NULL,
        type varchar(16) NOT NULL,
        display_name varchar(128) NOT NULL,
        tick_size numeric(18,8) NOT NULL DEFAULT 0.01,
        lot_size numeric(18,4) NOT NULL DEFAULT 1,
        meta jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_instruments_symbol_exchange ON instruments(symbol, exchange_code)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS watchlists (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id varchar(64) NOT NULL,
        user_id uuid NOT NULL,
        name varchar(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists(tenant_id, user_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS watchlist_items (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        watchlist_id uuid NOT NULL,
        instrument_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_watchlist_item_watchlist FOREIGN KEY (watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist ON watchlist_items(watchlist_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS watchlist_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS watchlists`);
    await queryRunner.query(`DROP TABLE IF EXISTS instruments`);
    await queryRunner.query(`DROP TABLE IF EXISTS exchanges`);
  }
}
