/**
 * File:        apps/backend/src/modules/compliance/adapters/dfsa.adapter.ts
 * Module:      compliance · adapters
 * Purpose:     DFSA (Dubai Financial Services Authority) pre-trade compliance checks.
 *              Enforces DIFC leverage caps and restricted product rules for retail clients.
 *
 * Exports:
 *   - DfsaAdapter — IComplianceAdapter for jurisdictionCode 'DFSA'
 *
 * Side-effects: none (screening API calls planned for Phase 2 AML integration)
 *
 * Key invariants:
 *   - DFSA retail leverage caps align with ESMA 2018 guidelines adopted by DFSA:
 *     FX major pairs 30:1, FX minor/exotic 20:1, indices 20:1, commodities 10:1,
 *     individual equities 5:1, crypto 2:1
 *   - Professional clients and eligible counterparties are exempt from retail caps
 *   - CIS and speculative instruments restricted for retail per DFSA COB Module
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Injectable } from '@nestjs/common';
import { IComplianceAdapter, PreTradeComplianceParams, ComplianceCheckResult } from './compliance-adapter.interface';

const RETAIL_MAX_LEVERAGE: Record<string, number> = {
  FX_MAJOR: 30,
  FX_MINOR: 20,
  FX_EXOTIC: 20,
  INDEX_CFD: 20,
  COMMODITY_CFD: 10,
  EQUITY: 5,
  EQUITY_CFD: 5,
  CRYPTO: 2,
};

const RESTRICTED_FOR_RETAIL = new Set(['BINARY_OPTION', 'PREDICTION_MARKET', 'SPECULATIVE_TOKEN']);

@Injectable()
export class DfsaAdapter implements IComplianceAdapter {
  jurisdictionCode(): string {
    return 'DFSA';
  }

  async enforcePreTrade(params: PreTradeComplianceParams): Promise<ComplianceCheckResult> {
    const violations: string[] = [];
    const isRetail = !params.clientCategory || params.clientCategory === 'RETAIL';

    if (isRetail && RESTRICTED_FOR_RETAIL.has(params.instrumentType)) {
      violations.push(
        `DFSA: ${params.instrumentType} products are restricted for retail clients under DIFC COB Module`,
      );
    }

    if (isRetail && params.leverage) {
      const maxLeverage = RETAIL_MAX_LEVERAGE[params.instrumentType];
      if (maxLeverage !== undefined && params.leverage > maxLeverage) {
        violations.push(
          `DFSA: Requested leverage ${params.leverage}:1 exceeds retail limit ${maxLeverage}:1 for ${params.instrumentType}`,
        );
      }
    }

    return { passed: violations.length === 0, violations };
  }
}
