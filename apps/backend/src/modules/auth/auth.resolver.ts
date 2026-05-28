/**
 * File:        apps/backend/src/modules/auth/auth.resolver.ts
 * Module:      auth · GraphQL
 * Purpose:     GraphQL resolver for auth queries — current user and session listing.
 *              No auth secrets (password/tokens) are ever exposed through GraphQL.
 *
 * Exports:
 *   - AuthResolver — @Query(() => CurrentUserDto), @Query(() => [SessionDto])
 *
 * Depends on:
 *   - @nestjs/graphql          — @Resolver, @Query, @ObjectType, @Field
 *   - @nestjs/apollo           — @UseGuards (Apollo adapter)
 *   - ./auth.service           — AuthService.getCurrentUser, .listSessions, .decodeJwtPayload
 *   - ../users/entities/user.entity  — UserEntity
 *   - AppLoggerService         — structured logging
 *
 * Side-effects: none (read-only queries)
 *
 * Key invariants:
 *   - JwtAuthGuard enforces a valid access token on every query
 *   - UserEntity intentionally omitted from public GraphQL schema — only scalar
 *     identity fields are returned to avoid leaking PII through introspection
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Resolver, Query, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ObjectType()
export class CurrentUserDto {
  @Field(() => ID)
  userId!: string;

  @Field()
  tenantId!: string;
}

@ObjectType()
export class SessionDto {
  @Field()
  tokenId!: string;

  @Field({ nullable: true })
  deviceInfo!: string | null;

  @Field({ nullable: true })
  ipAddress!: string | null;

  @Field({ nullable: true })
  userAgent!: string | null;

  @Field({ nullable: true })
  lastUsedAt!: Date | null;

  @Field({ nullable: true })
  revokedAt!: Date | null;

  @Field()
  createdAt!: Date;

  @Field()
  expiresAt!: Date;
}

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Query(() => CurrentUserDto)
  @UseGuards(JwtAuthGuard)
  async me(@Args('userId') userId: string, @Args('tenantId') tenantId: string): Promise<CurrentUserDto> {
    const result = await this.authService.getCurrentUser(userId, tenantId);
    return result;
  }

  @Query(() => [SessionDto])
  @UseGuards(JwtAuthGuard)
  async sessions(@Args('userId') userId: string): Promise<SessionDto[]> {
    return this.authService.listSessions(userId);
  }
}