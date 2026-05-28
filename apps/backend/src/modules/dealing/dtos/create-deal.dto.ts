/**
 * @file src/modules/dealing/dtos/create-deal.dto.ts
 * @module dealing
 * @description DTO for deal creation
 * @author BharatERP
 * @created 2026-02-19
 */

import { IsIn, IsNumberString, IsObject, IsOptional, IsString } from 'class-validator';
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreateDealDto {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @Field(() => String)
  @IsString()
  instrumentId!: string;

  @Field(() => String)
  @IsIn(['BUY', 'SELL', 'BUY_HEDGE', 'SELL_HEDGE'])
  side!: 'BUY' | 'SELL' | 'BUY_HEDGE' | 'SELL_HEDGE';

  @Field(() => String)
  @IsNumberString()
  quantity!: string;

  @Field(() => String)
  @IsNumberString()
  price!: string;

  @Field(() => String, { nullable: true })
  @IsObject()
  metadata?: string | null;

  @Field(() => String, { nullable: true })
  status?: string;
}
