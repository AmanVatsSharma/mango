/**
 * File:        apps/backend/src/modules/auth/entities/refresh-token.entity.ts
 * Module:      auth
 * Purpose:     Refresh token entity with rotation and reuse detection
 *
 * Exports:
 *   - RefreshTokenEntity  — DB entity (managed by AuthService)
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
 *   1. RefreshTokenEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@ObjectType()
@Entity('refresh_tokens')
@Index('idx_refresh_user', ['userId'])
@Index('idx_refresh_tenant_user', ['tenantId', 'userId'])
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  @Field(() => ID)
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  @Field()
  tenantId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Field()
  userId!: string;

  @Column({ name: 'token_id', type: 'varchar', length: 64 })
  @Field()
  tokenId!: string;

  @Column({ name: 'hashed_token', type: 'varchar', length: 255 })
  @Field()
  hashedToken!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  @Field()
  expiresAt!: Date;

  @Column({ name: 'device_info', type: 'varchar', length: 64, nullable: true })
  @Field({ nullable: true })
  deviceInfo?: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  @Field({ nullable: true })
  ipAddress?: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  @Field({ nullable: true })
  userAgent?: string | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  @Field({ nullable: true })
  lastUsedAt?: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  @Field({ nullable: true })
  revokedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @Field()
  updatedAt!: Date;
}
