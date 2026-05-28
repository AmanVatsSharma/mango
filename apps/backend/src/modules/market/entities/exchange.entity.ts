/**
 * @file src/modules/market/entities/exchange.entity.ts
 * @module market
 * @description Exchange entity (e.g., NSE, NASDAQ) with basic metadata
 * @author BharatERP
 * @created 2025-09-19
 * @last-updated 2026-05-08
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('exchanges')
@Unique(['code'])
@Index('idx_exchanges_code', ['code'])
export class ExchangeEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'code', type: 'varchar', length: 16 })
  code!: string; // e.g., NSE, NASDAQ, FX, BINANCE

  @Column({ name: 'name', type: 'varchar', length: 128 })
  name!: string;

  @Column({ name: 'country', type: 'varchar', length: 64, nullable: true })
  country?: string | null;

  @Column({ name: 'timezone', type: 'varchar', length: 64, nullable: true })
  timezone?: string | null;

  @Column({ name: 'data_provider_code', type: 'varchar', length: 32, nullable: true })
  dataProviderCode?: string | null; // e.g. 'KITE', 'GENERIC_REST'; null falls back to GENERIC_REST

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
