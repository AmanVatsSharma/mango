/**
 * File:        lib/withdrawal/rules/fraud-flagged.ts
 * Module:      Withdrawal · Risk Engine · Rules
 * Purpose:     Withdrawal-side fraud-flag rule. Reads BOTH the legacy KYC suspicious-status
 *              signal AND any open Phase-13b HouseSurveillanceAlert with HIGH or CRITICAL
 *              severity for the user. Either source is enough to flag; both → message lists
 *              the surveillance source first (more recent signal).
 *
 * Exports:
 *   - fraudFlaggedRule — RuleEvaluator
 *
 * Depends on:
 *   - @/lib/prisma — reads KYC.suspiciousStatus, KYC.amlStatus, HouseSurveillanceAlert.
 *
 * Side-effects: read-only.
 *
 * Key invariants:
 *   - High point value (default 100) is intentional: a fraud flag should ~always cross the
 *     hold threshold and force the approval chain.
 *   - Phase-13b surveillance is the *primary* signal; KYC suspicious status remains as a
 *     fallback — historical data still routes through it.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { prisma } from "@/lib/prisma"
import { KycSuspiciousStatus, SurveillanceAlertStatus } from "@prisma/client"
import type { RuleEvaluator } from "../types"

export const fraudFlaggedRule: RuleEvaluator = async ({ userId }) => {
  // Phase 13b — primary signal: any OPEN surveillance alert at HIGH/CRITICAL severity.
  const surveillanceHit = await prisma.houseSurveillanceAlert.findFirst({
    where: {
      relatedUserId: userId,
      severity: { in: ["HIGH", "CRITICAL"] },
      status: {
        in: [SurveillanceAlertStatus.OPEN, SurveillanceAlertStatus.ASSIGNED, SurveillanceAlertStatus.INVESTIGATING],
      },
    },
    orderBy: { createdAt: "desc" },
    select: { ruleKey: true, severity: true, message: true, createdAt: true },
  })
  if (surveillanceHit) {
    return {
      fired: true,
      message: `Surveillance alert ${surveillanceHit.ruleKey} (${surveillanceHit.severity}): ${surveillanceHit.message}`,
    }
  }

  // Legacy fallback — KYC table flags. B-book anti-fraud, not regulatory.
  const kyc = await prisma.kYC.findUnique({
    where: { userId },
    select: { suspiciousStatus: true, amlStatus: true, amlFlags: true },
  })
  if (!kyc) return { fired: false }

  const suspicious =
    kyc.suspiciousStatus === KycSuspiciousStatus.REVIEW ||
    kyc.suspiciousStatus === KycSuspiciousStatus.ESCALATED
  if (suspicious) {
    return {
      fired: true,
      message: `User flagged in KYC surveillance (suspiciousStatus=${kyc.suspiciousStatus}).`,
    }
  }
  if (kyc.amlStatus === "HIT" && kyc.amlFlags.length > 0) {
    return {
      fired: true,
      message: `AML hit on file (flags: ${kyc.amlFlags.slice(0, 3).join(", ")}).`,
    }
  }
  return { fired: false }
}
