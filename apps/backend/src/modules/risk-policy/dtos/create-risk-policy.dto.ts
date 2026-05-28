/**
 * @file src/modules/risk-policy/dtos/create-risk-policy.dto.ts
 * @module risk-policy
 * @description DTOs for risk policy creation and tenant assignment
 * @author BharatERP
 * @created 2026-02-17
 */

import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreateRiskPolicyDto {
  @Field(() => String)
  @IsUUID()
  tenantId!: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  jurisdictionCode!: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  policyName!: string;

  @Field(() => String)
  @Matches(/^\d+(\.\d+)?$/)
  maxLeverage!: string;

  @Field(() => String)
  @Matches(/^\d+(\.\d+)?$/)
  maxOrderNotional!: string;

  @Field(() => [String])
  @IsArray()
  restrictedProducts!: string[];

  @Field(() => Boolean)
  @IsBoolean()
  sanctionsCheckRequired!: boolean;
}

@InputType()
export class AssignRiskPolicyDto {
  @Field(() => String)
  @IsUUID()
  tenantId!: string;

  @Field(() => String)
  @IsUUID()
  riskPolicyId!: string;

  @Field(() => String)
  @IsIn(['TENANT', 'BROKER', 'DESK', 'ACCOUNT'])
  scopeType!: 'TENANT' | 'BROKER' | 'DESK' | 'ACCOUNT';

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  scopeValue!: string;
}
