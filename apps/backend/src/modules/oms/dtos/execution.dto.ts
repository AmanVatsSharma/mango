/**
 * @file src/modules/oms/dtos/execution.dto.ts
 * @module oms
 * @description DTO for adding executions (fills)
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsString, Length, Matches } from 'class-validator';

export class AddExecutionDto {
  @IsString()
  @Length(1, 64)
  orderId!: string;

  @IsString()
  @Length(1, 64)
  accountId!: string;

  @IsString()
  @Length(1, 64)
  instrumentId!: string;

  @IsString()
  @Matches(/^\d{1,20}(\.\d{1,8})?$/)
  quantity!: string;

  @IsString()
  @Matches(/^\d{1,20}(\.\d{1,8})?$/)
  price!: string;

  @IsString()
  @Matches(/^\d{1,20}(\.\d{1,8})?$/)
  fees!: string;

  @IsString()
  @Length(1, 128)
  externalRefId!: string;
}


