/**
 * File:        apps/backend/src/modules/rules-engine/entities/rule.entity.ts
 * Module:      rules-engine
 * Purpose:     Tenant-scoped automation rules — event triggers, condition chains,
 *              and action sequences defined by broker admins.
 *
 * Exports:
 *   - RuleEntity         — TypeORM entity for `automation_rules` table
 *   - RuleStatus         — ACTIVE | INACTIVE
 *
 * Depends on:  typeorm
 * Side-effects: none
 *
 * Key invariants:
 *   - conditions and actions are JSONB — flexible schema per rule type
 *   - name is unique per tenant
 *   - executionCount increments on each trigger evaluation (not just match)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

export type RuleStatus = 'ACTIVE' | 'INACTIVE';

@ObjectType()
@Entity('automation_rules')
@Index('idx_rules_tenant', ['tenantId'])
@Index('idx_rules_tenant_name', ['tenantId', 'name'], { unique: true })
export class RuleEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  @Field(() => ID)
  tenantId!: string;

  @Column({ name: 'name', type: 'varchar', length: 160 })
  @Field()
  name!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  @Field({ nullable: true })
  description?: string | null;

  /** Event that triggers this rule evaluation */
  @Column({ name: 'trigger_event', type: 'varchar', length: 64 })
  @Field()
  triggerEvent!: string;

  /** JSONB array of condition objects: { field, op, value } */
  @Column({ name: 'conditions', type: 'jsonb', default: [] })
  conditions!: any[];

  /** JSONB array of action objects: { type, params } */
  @Column({ name: 'actions', type: 'jsonb', default: [] })
  actions!: any[];

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'ACTIVE' })
  @Field()
  status!: RuleStatus;

  @Column({ name: 'priority', type: 'int', default: 0 })
  @Field(() => Int)
  priority!: number;

  @Column({ name: 'execution_count', type: 'int', default: 0 })
  @Field(() => Int)
  executionCount!: number;

  @Column({ name: 'last_triggered_at', type: 'timestamptz', nullable: true })
  @Field({ nullable: true })
  lastTriggeredAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
