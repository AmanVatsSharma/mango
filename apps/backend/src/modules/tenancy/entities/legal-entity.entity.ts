/**
 * File:        apps/backend/src/modules/tenancy/entities/legal-entity.entity.ts
 * Module:      tenancy
 * Purpose:     Legal entity records mapped under tenants for jurisdictional compliance
 *
 * Exports:
 *   - LegalEntityEntity  — DB entity (managed by TenancyService)
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. LegalEntityEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@ObjectType()
@Entity('legal_entities')
export class LegalEntityEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'varchar', length: 255 })
  @Field()
  legalName!: string;

  @Column({ type: 'varchar', length: 64 })
  @Field()
  registrationNumber!: string;

  @Column({ type: 'varchar', length: 3 })
  @Field()
  countryCode!: string;

  @Column({ type: 'varchar', length: 16, default: 'PRIMARY' })
  @Field()
  type!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
