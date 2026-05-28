/**
 * File:        apps/backend/src/modules/developer-platform/entities/api-key.entity.ts
 * Module:      developer-platform · Entities
 * Purpose:     API key entity for developer authentication
 *
 * Exports:
 *   - ApiKeyEntity — long-lived API key for programmatic access
 *
 * Depends on:
 *   - @nestjs/graphql — @ObjectType, @Field decorators
 *
 * Side-effects:  none
 *
 * Key invariants:
 *   - keyPrefix is the first 8 chars of the hashed key (not the secret itself)
 *   - scopes is a JSON array stored in jsonb; empty array [] means no permissions
 *
 * Read order:
 *   1. ApiKeyEntity         — entity shape (this file)
 *   2. DeveloperPlatformResolver — ApiKeyObjectType mapping
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@ObjectType()
@Entity('developer_api_keys')
export class ApiKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'uuid' })
  @Field()
  appId!: string;

  @Column({ type: 'varchar', length: 64 })
  @Field()
  keyPrefix!: string;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  @Field()
  status!: string;

  @Column({ type: 'timestamptz', nullable: true })
  @Field({ nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'jsonb', default: '[]' })
  scopes!: string[];
  // NOTE: no @Field on jsonb columns

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
