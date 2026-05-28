/**
 * File:        apps/backend/src/modules/rules-engine/dtos/rule.dto.ts
 * Module:      rules-engine
 * Purpose:     DTOs for rule CRUD endpoints.
 *
 * Exports:
 *   - CreateRuleDto   — create a new automation rule
 *   - UpdateRuleDto   — patch an existing rule
 *   - RuleConditionDto — individual condition in a rule
 *   - RuleActionDto   — individual action in a rule
 *
 * Depends on:  class-validator, class-transformer, @nestjs/graphql
 * Side-effects: none
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-20
 */

import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class RuleConditionDto {
  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  field!: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  op!: string;

  @Field(() => String)
  @IsNotEmpty()
  value!: string;
}

@InputType()
export class RuleActionDto {
  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  type!: string;

  @Field(() => String, { nullable: true })
  @IsString()
  @IsOptional()
  params?: string;
}

@InputType()
export class CreateRuleDto {
  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Field(() => String, { nullable: true })
  @IsString()
  @IsOptional()
  description?: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  triggerEvent!: string;

  @Field(() => [RuleConditionDto])
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions!: RuleConditionDto[];

  @Field(() => [RuleActionDto])
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleActionDto)
  actions!: RuleActionDto[];

  @Field(() => Number, { nullable: true })
  @IsInt()
  @IsOptional()
  priority?: number;
}

@InputType()
export class UpdateRuleDto {
  @Field(() => String, { nullable: true })
  @IsString()
  @IsOptional()
  name?: string;

  @Field(() => String, { nullable: true })
  @IsString()
  @IsOptional()
  description?: string;

  @Field(() => String, { nullable: true })
  @IsString()
  @IsOptional()
  triggerEvent?: string;

  @Field(() => [RuleConditionDto], { nullable: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  @IsOptional()
  conditions?: RuleConditionDto[];

  @Field(() => [RuleActionDto], { nullable: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleActionDto)
  @IsOptional()
  actions?: RuleActionDto[];

  @Field(() => Boolean, { nullable: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @Field(() => Number, { nullable: true })
  @IsInt()
  @IsOptional()
  priority?: number;
}