/**
 * File:        apps/backend/src/modules/onboarding/onboarding.resolver.ts
 * Module:      onboarding · GraphQL
 * Purpose:     GraphQL queries for onboarding profile listing — tenant-scoped.
 *
 * Exports:
 *   - OnboardingResolver — @Query(() => [OnboardingProfileDto])
 *
 * Depends on:
 *   - @nestjs/graphql          — decorators
 *   - @nestjs/apollo           — UseGuards
 *   - ./services/onboarding.service — OnboardingService.listProfiles
 *   - ./entities/onboarding-profile.entity — OnboardingProfileEntity
 *   - AppLoggerService         — structured logging
 *
 * Side-effects: none (read-only query)
 *
 * Key invariants:
 *   - TenantGuard scopes all queries to the authenticated tenant automatically
 *   - OnboardingProfileEntity fields are listed explicitly; no raw entity exposed
 *     through GraphQL ObjectType to control the public surface
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { Resolver, Query, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { OnboardingService } from './services/onboarding.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../rbac/guards/tenant.guard';

export enum OnboardingStep {
  BASIC_DETAILS = 'BASIC_DETAILS',
  KYC_VERIFICATION = 'KYC_VERIFICATION',
  BANK_DETAILS = 'BANK_DETAILS',
  TRADING_PREFERENCES = 'TRADING_PREFERENCES',
  DOCUMENT_UPLOAD = 'DOCUMENT_UPLOAD',
  REVIEW = 'REVIEW',
  COMPLETED = 'COMPLETED',
}

registerEnumType(OnboardingStep, { name: 'OnboardingStep' });

@ObjectType()
export class OnboardingProfileDto {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  userId!: string;

  @Field({ nullable: true })
  step!: string | null;

  @Field({ nullable: true })
  tradingExperience!: string | null;

  @Field({ nullable: true })
  investmentObjective!: string | null;

  @Field({ nullable: true })
  riskAppetite!: string | null;

  @Field({ nullable: true })
  annualIncome!: string | null;

  @Field({ nullable: true })
  occupation!: string | null;

  @Field({ nullable: true })
  sourceOfFunds!: string | null;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@Resolver()
export class OnboardingResolver {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Query(() => [OnboardingProfileDto])
  @UseGuards(JwtAuthGuard, TenantGuard)
  async onboardingProfiles(
    @Args('tenantId') tenantId: string,
  ): Promise<OnboardingProfileDto[]> {
    const profiles = await this.onboardingService.listProfiles(tenantId);
    return profiles.map((p) => ({
      id: p.id,
      tenantId: p.tenantId,
      userId: p.userId,
      step: (p as any).step ?? null,
      tradingExperience: (p as any).tradingExperience ?? null,
      investmentObjective: (p as any).investmentObjective ?? null,
      riskAppetite: (p as any).riskAppetite ?? null,
      annualIncome: (p as any).annualIncome ?? null,
      occupation: (p as any).occupation ?? null,
      sourceOfFunds: (p as any).sourceOfFunds ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }
}