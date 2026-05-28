/**
 * @file src/modules/accounts/dtos/cash-credit-debit.dto.ts
 * @module accounts
 * @description DTO for cash credit/debit posting
 * @author BharatERP
 * @created 2025-09-19
 */

import {
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CashCreditDebitDto {
  @IsString()
  @Length(3, 8)
  currency!: string;

  @IsString()
  @Matches(/^-?\d{1,20}(\.\d{1,8})?$/)
  amount!: string; // will be positive; direction captures sign

  @IsIn(['credit', 'debit'])
  direction!: 'credit' | 'debit';

  @IsIn([
    'deposit',
    'withdrawal',
    'fee',
    'adjustment',
    'trade',
    'settlement',
    'hold',
    'release',
  ])
  kind!:
    | 'deposit'
    | 'withdrawal'
    | 'fee'
    | 'adjustment'
    | 'trade'
    | 'settlement'
    | 'hold'
    | 'release';

  @IsString()
  @Length(1, 128)
  externalRefId!: string;

  @IsOptional()
  @IsDefined()
  meta?: Record<string, unknown>;
}
