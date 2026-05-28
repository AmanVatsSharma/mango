/**
 * File:        apps/backend/src/modules/users/users.resolver.ts
 * Module:      users · GraphQL
 * Purpose:     GraphQL queries for user identity lookups — id and tenant-scoped list.
 *
 * Exports:
 *   - UsersResolver — @Query(() => UserDto, { nullable: true }), @Query(() => [UserDto])
 *
 * Depends on:
 *   - @nestjs/graphql          — decorators
 *   - @nestjs/apollo           — UseGuards
 *   - ./users.service          — UsersService.findById, .findAll
 *   - ./entities/user.entity   — UserEntity (private; not exposed via GraphQL return type)
 *   - AppLoggerService         — structured logging
 *
 * Side-effects: none (read-only queries)
 *
 * Key invariants:
 *   - TenantGuard scopes all queries to the authenticated tenant automatically
 *   - PermissionsGuard enforces users:read on list; single user lookup is always allowed
 *   - UserEntity is NOT exposed through GraphQL ObjectType — fields are listed explicitly
 *     to control which user data is visible through the API layer
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { Resolver, Query, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { Permissions } from '../rbac/decorators/permissions.decorator';

@ObjectType()
export class UserDto {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  mobileE164!: string;

  @Field({ nullable: true })
  email!: string | null;

  @Field()
  isMobileVerified!: boolean;

  @Field()
  isEmailVerified!: boolean;

  @Field({ nullable: true })
  name!: string | null;

  @Field({ nullable: true })
  countryCode!: string | null;

  @Field()
  isActive!: boolean;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType()
export class UserListDto {
  @Field(() => [UserDto])
  data!: UserDto[];

  @Field(() => Int)
  page!: number;

  @Field(() => Int)
  limit!: number;

  @Field(() => Int)
  total!: number;
}

@Resolver()
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => UserDto, { nullable: true })
  @UseGuards(JwtAuthGuard, TenantGuard)
  async user(
    @Args('id') id: string,
  ): Promise<UserDto | null> {
    const entity = await this.usersService.findById(id);
    if (!entity) return null;
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      mobileE164: entity.mobileE164,
      email: entity.email ?? null,
      isMobileVerified: entity.isMobileVerified,
      isEmailVerified: entity.isEmailVerified,
      name: entity.name ?? null,
      countryCode: entity.countryCode ?? null,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
    };
  }

  @Query(() => UserListDto)
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Permissions('users:read')
  async users(
    @Args('tenantId') tenantId: string,
    @Args('page', { nullable: true }) page?: number,
    @Args('limit', { nullable: true }) limit?: number,
    @Args('search', { nullable: true }) search?: string,
  ): Promise<UserListDto> {
    return this.usersService.findAll(tenantId, { page, limit, search }).then(r => ({
      data: r.data.map(e => ({
        id: e.id,
        tenantId: e.tenantId,
        email: e.email ?? null,
        isMobileVerified: e.isMobileVerified,
        isEmailVerified: e.isEmailVerified,
        name: e.name ?? null,
        countryCode: e.countryCode ?? null,
        isActive: e.isActive,
        createdAt: e.createdAt,
      } as UserDto)),
      page: r.page,
      limit: r.limit,
      total: r.total,
    }));
  }
}