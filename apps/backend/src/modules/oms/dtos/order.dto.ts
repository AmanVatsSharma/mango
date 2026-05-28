/**
 * @file src/modules/oms/dtos/order.dto.ts
 * @module oms
 * @description DTOs for order placement and modification
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class PlaceOrderDto {
  @Field(() => String)
  @ApiProperty({ minLength: 1, maxLength: 64 })
  @IsString()
  @Length(1, 64)
  accountId!: string;

  @Field(() => String)
  @ApiProperty({ minLength: 1, maxLength: 64 })
  @IsString()
  @Length(1, 64)
  instrumentId!: string;

  @Field(() => String)
  @ApiProperty({ enum: ['BUY', 'SELL'] })
  @IsIn(['BUY', 'SELL'])
  side!: 'BUY' | 'SELL';

  @Field(() => String)
  @ApiProperty({ enum: ['MARKET', 'LIMIT'] })
  @IsIn(['MARKET', 'LIMIT'])
  type!: 'MARKET' | 'LIMIT';

  @Field(() => String)
  @ApiProperty({ pattern: '^\\d{1,20}(\\.\\d{1,8})?$' })
  @IsString()
  @Matches(/^\d{1,20}(\.\d{1,8})?$/)
  quantity!: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ pattern: '^\\d{1,20}(\\.\\d{1,8})?$' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,20}(\.\d{1,8})?$/)
  price?: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ minLength: 1, maxLength: 64 })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  clientOrderId?: string;

  @Field(() => String)
  @ApiProperty({ enum: ['DAY', 'IOC', 'GTC', 'FOK'], default: 'DAY' })
  @IsIn(['DAY', 'IOC', 'GTC', 'FOK'])
  timeInForce!: 'DAY' | 'IOC' | 'GTC' | 'FOK';

  @Field(() => String)
  @ApiProperty({ minLength: 1, maxLength: 128, description: 'Idempotency key for the order at tenant scope' })
  @IsString()
  @Length(1, 128)
  externalRefId!: string;
}

@InputType()
export class CancelOrderDto {
  @Field(() => String)
  @IsString()
  @Length(1, 64)
  orderId!: string;
}

@InputType()
export class ModifyOrderDto {
  @Field(() => String)
  @ApiProperty({ minLength: 1, maxLength: 64 })
  @IsString()
  @Length(1, 64)
  orderId!: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ pattern: '^\\d{1,20}(\\.\\d{1,8})?$' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,20}(\.\d{1,8})?$/)
  price?: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ pattern: '^\\d{1,20}(\\.\\d{1,8})?$' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,20}(\.\d{1,8})?$/)
  quantity?: string;

  @Field(() => String, { nullable: true })
  @ApiPropertyOptional({ enum: ['DAY', 'IOC', 'GTC', 'FOK'] })
  @IsOptional()
  @IsIn(['DAY', 'IOC', 'GTC', 'FOK'])
  timeInForce?: 'DAY' | 'IOC' | 'GTC' | 'FOK';
}