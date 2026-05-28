/**
 * File:        apps/backend/src/modules/support/support.resolver.ts
 * Module:      support · GraphQL Resolver
 * Purpose:     GraphQL API for support ticket management and impersonation audit.
 *
 * Exports:
 *   - SupportResolver — NestJS GraphQL @Resolver()
 *
 * Depends on:
 *   - SupportService — createTicket, listTickets, getTicketStatus, auditImpersonation
 *   - JwtAuthGuard  — auth enforcement
 *   - TenantGuard   — tenant isolation
 *
 * Side-effects:
 *   - DB writes on createTicket
 *   - Structured audit log on auditImpersonation
 *
 * Key invariants:
 *   - Support agents can impersonate users for ticket resolution (audit-logged)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { SupportService } from './services/support.service';
import { JwtAuthGuard } from '@obsidian/backend-auth';
import { TenantGuard } from '@obsidian/backend-rbac';
import { PermissionsGuard } from '@obsidian/backend-rbac';
import { Permissions } from '@obsidian/backend-rbac';
import { Tenant } from '@obsidian/backend-rbac';
import { AppLoggerService } from '../../shared/logger';

@ObjectType('SupportTicket')
export class SupportTicketObjectType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  userId!: string;

  @Field()
  subject!: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  priority?: string;

  @Field()
  createdAt!: string;
}

@Resolver()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class SupportResolver {
  constructor(
    private readonly svc: SupportService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(SupportResolver.name);
  }

  @Query(() => [SupportTicketObjectType], { name: 'supportTickets' })
  @Permissions('support:read')
  async listTickets(@Tenant() tenantId: string): Promise<SupportTicketObjectType[]> {
    this.logger.debug('SupportResolver.listTickets()', { tenantId });
    const tickets = await this.svc.listTickets(tenantId);
    return tickets.map((t) => ({
      id: t.id,
      tenantId: t.tenantId,
      userId: t.userId,
      subject: (t as any).subject ?? '',
      status: t.status,
      priority: (t as any).priority ?? null,
      createdAt: t.createdAt?.toISOString() ?? '',
    }));
  }

  @Mutation(() => SupportTicketObjectType)
  @Permissions('support:write')
  async createSupportTicket(
    @Tenant() tenantId: string,
    @Args('userId') userId: string,
    @Args('subject') subject: string,
    @Args('priority', { nullable: true }) priority?: string,
  ): Promise<SupportTicketObjectType> {
    this.logger.debug('SupportResolver.createTicket()', { tenantId, userId, subject });
    const t = await this.svc.createTicket({ tenantId, userId, subject, description: '', metadata: undefined, priority: priority as any });
    return {
      id: t.id,
      tenantId: t.tenantId,
      userId: t.userId,
      subject,
      status: t.status,
      priority: priority ?? null,
      createdAt: t.createdAt?.toISOString() ?? '',
    };
  }
}
