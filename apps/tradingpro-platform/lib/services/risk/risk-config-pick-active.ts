/**
 * @file risk-config-pick-active.ts
 * @module lib/services/risk
 * @description Single precedence walk for picking the winning RiskConfig row (segment x productType candidate order).
 * @author StockTrade
 * @created 2026-04-08
 *
 * Notes:
 * - Candidate **ordering** comes from `resolveRiskConfigSegmentCandidates` and
 *   `resolveRiskConfigProductTypeCandidatesForInstrument`; this module only applies the flatMap precedence.
 */

/**
 * First matching row in cross-product order: outer segmentCandidates, inner productTypeCandidates.
 */
export function pickActiveRiskConfigRow<T extends { segment: string; productType: string }>(
  segmentCandidates: string[],
  productTypeCandidates: string[],
  configs: T[],
): T | null {
  const found =
    segmentCandidates
      .flatMap((segmentCandidate) =>
        productTypeCandidates.map((productTypeCandidate) =>
          configs.find(
            (candidate) =>
              candidate.segment === segmentCandidate && candidate.productType === productTypeCandidate,
          ),
        ),
      )
      .find((candidate) => candidate != null) ?? null
  return found
}
