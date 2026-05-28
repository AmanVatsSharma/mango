/**
 * File:        apps/backend/src/modules/compliance/adapters/fca.adapter.ts
 * Module:      compliance · adapters
 * Purpose:     FCA (UK Financial Conduct Authority) / MiFID II pre-trade compliance.
 *              Enforces PS20/10 leverage caps and CFD retail client protections.
 *
 * Exports:
 *   - FcaAdapter — IComplianceAdapter for jurisdictionCode 'FCA'
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - PS20/10 leverage caps (same as ESMA): FX major 30:1, minor 20:1, indices 20:1,
 *     commodities/non-gold 10:1, gold 20:1, individual equities 5:1, crypto 2:1
 *   - Automatic close-out at 50% margin; negative balance protection at account level
 *     (enforced at position close by MarginEngineService — not here)
 *   - PRIIP KID required before retail client can trade CFDs —
 *     checked via `kidsAccepted` flag from account profile (not enforced here yet)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Injectable } from '@nestjs/common';
import { IComplianceAdapter, PreTradeComplianceParams, ComplianceCheckResult } from './compliance-adapter.interface';

const FCA_RETAIL_MAX_LEVERAGE: Record<string, number> = {
  FX_MAJOR: 30,
  FX_MINOR: 20,
  FX_EXOTIC: 20,
  INDEX_CFD: 20,
  COMMODITY_CFD: 10,
  GOLD_CFD: 20,
  EQUITY: 5,
  EQUITY_CFD: 5,
  CRYPTO: 2,
};

const FCA_BANNED_PRODUCTS = new Set(['BINARY_OPTION', 'CRYPTO_CFD_RETAIL_UK']);

@Injectable()
export class FcaAdapter implements IComplianceAdapter {
  jurisdictionCode(): string {
    return 'FCA';
  }

  async enforcePreTrade(params: PreTradeComplianceParams): Promise<ComplianceCheckResult> {
    const violations: string[] = [];
    const isRetail = !params.clientCategory || params.clientCategory === 'RETAIL';

    if (isRetail && FCA_BANNED_PRODUCTS.has(params.instrumentType)) {
      violations.push(
        `FCA PS20/10: ${params.instrumentType} is banned for retail clients`,
      );
    }

    if (isRetail && params.leverage) {
      const maxLev = FCA_RETAIL_MAX_LEVERAGE[params.instrumentType];
      if (maxLev !== undefined && params.leverage > maxLev) {
        violations.push(
          `FCA PS20/10: Leverage ${params.leverage}:1 exceeds retail cap ${maxLev}:1 for ${params.instrumentType}`,
        );
      }
    }

    return { passed: violations.length === 0, violations };
  }
}
