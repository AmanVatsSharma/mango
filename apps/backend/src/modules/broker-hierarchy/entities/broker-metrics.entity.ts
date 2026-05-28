/**
 * File:        apps/backend/src/modules/broker-hierarchy/entities/broker-metrics.entity.ts
 * Module:      broker-hierarchy
 * Purpose:     Aggregated business metrics (AUM, clients, revenue, health score) per broker,
 *              refreshed on a schedule and used for dashboarding and risk scoring.
 *
 * Exports:
 *   - BrokerMetricsEntity — aggregated metrics snapshot for a broker
 *
 * Depends on:
 *   - typeorm — decorators and entity base
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - brokerId is unique — one metrics row per broker (enforced by unique index)
 *   - tenantId mirrors BrokerEntity.tenantId for cross-entity joins
 *   - healthScore is clamped to 0-100 by convention; application layer enforces
 *
 * Read order:
 *   1. BrokerMetricsEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-10
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('broker_metrics')
@Index('idx_broker_metrics_broker', ['brokerId'], { unique: true })
export class BrokerMetricsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'broker_id', type: 'uuid' })
  brokerId!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Column({ name: 'aum', type: 'decimal', precision: 24, scale: 8, default: '0' })
  aum!: string;

  @Column({ name: 'clients', type: 'integer', default: 0 })
  clients!: number;

  @Column({ name: 'monthly_revenue', type: 'decimal', precision: 20, scale: 4, default: '0' })
  monthlyRevenue!: string;

  @Column({ name: 'monthly_revenue_prev', type: 'decimal', precision: 20, scale: 4, default: '0' })
  monthlyRevenuePrev!: string;

  @Column({ name: 'health_score', type: 'integer', default: 0 })
  healthScore!: number;

  @Column({ name: 'last_activity_at', type: 'timestamptz', nullable: true })
  lastActivityAt?: Date | null;

  @Column({ name: 'computed_at', type: 'timestamptz', nullable: true })
  computedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
