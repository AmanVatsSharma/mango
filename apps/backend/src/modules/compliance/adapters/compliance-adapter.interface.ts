/**
 * File:        apps/backend/src/modules/compliance/adapters/compliance-adapter.interface.ts
 * Module:      compliance · adapters
 * Purpose:     Contract that every jurisdiction compliance adapter must implement.
 *              ComplianceService selects the correct adapter via jurisdictionCode.
 *
 * Exports:
 *   - IComplianceAdapter              — adapter interface
 *   - PreTradeComplianceParams        — input shape for pre-trade checks
 *   - ComplianceCheckResult           — output shape (pass/fail + reasons)
 *
 * Side-effects: none (implementations may call external AML/screening APIs)
 *
 * Key invariants:
 *   - jurisdictionCode() must match the value stored in compliance_policies.jurisdiction_code
 *   - enforcePreTrade() throws AppError('COMPLIANCE_BREACH', ...) on violation —
 *     returning a result object lets callers log without throwing
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

export interface PreTradeComplianceParams {
  tenantId: string;
  accountId: string;
  instrumentId: string;
  instrumentType: string;   // e.g. 'FX_CFD', 'EQUITY', 'CRYPTO'
  quantity: number;
  price: number | null;
  leverage?: number;
  clientCategory?: 'RETAIL' | 'PROFESSIONAL' | 'ELIGIBLE_COUNTERPARTY';
}

export interface ComplianceCheckResult {
  passed: boolean;
  violations: string[];
}

export interface IComplianceAdapter {
  jurisdictionCode(): string;
  enforcePreTrade(params: PreTradeComplianceParams): Promise<ComplianceCheckResult>;
}
