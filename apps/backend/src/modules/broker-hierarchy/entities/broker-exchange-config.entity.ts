/**
 * File:        apps/backend/src/modules/broker-hierarchy/entities/broker-exchange-config.entity.ts
 * Module:      broker-hierarchy
 * Purpose:     Per-broker exchange access toggle. Admins use this to enable or disable
 *              specific exchanges (NSE, BSE, MCX, NASDAQ, etc.) for a given broker.
 *              The OMS checks this table before routing any order.
 *
 * Exports:
 *   - BrokerExchangeConfigEntity — TypeORM entity for broker_exchange_configs table
 *
 * Depends on:
 *   - none (pure TypeORM entity)
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - (brokerId, exchangeCode) is UNIQUE — only one row per broker-exchange pair
 *   - enabled defaults to false — exchanges must be explicitly turned on per broker
 *   - connectorFamily is informational; the execution gateway still routes by asset class
 *
 * Read order:
 *   1. BrokerExchangeConfigEntity — the schema
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-08
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

@Entity('broker_exchange_configs')
@Unique(['brokerId', 'exchangeCode'])
@Index('idx_bec_broker_id', ['brokerId'])
export class BrokerExchangeConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  brokerId!: string;

  @Column({ type: 'varchar', length: 16 })
  exchangeCode!: string; // NSE, BSE, MCX, NASDAQ, LSE, etc.

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  connectorFamily?: string | null; // informational: which execution-gateway family handles orders

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
