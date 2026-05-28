/**
 * @file components/admin-v2/bonuses/types.ts
 * @module admin-v2/bonuses
 * @description Re-export of server types so client components have a single import surface.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export type {
  BonusGrantRow,
  BonusGrantStatus,
  BonusKind,
  BonusRuleInput,
  BonusRuleRow,
  BulkIssueInput,
  BulkIssueResult,
  PromoCodeInput,
  PromoCodeRow,
} from "@/lib/bonus/types"

export {
  BONUS_KIND_META,
  BONUS_KINDS,
  GRANT_STATUS_META,
  GRANT_STATUSES,
} from "@/lib/bonus/types"

import type {
  BonusGrantRow,
  BonusGrantStatus,
  BonusRuleRow,
  PromoCodeRow,
} from "@/lib/bonus/types"

export interface RulesListEnvelope {
  success: boolean
  rows: BonusRuleRow[]
}

export interface GrantsListEnvelope {
  success: boolean
  rows: BonusGrantRow[]
  total: number
  byStatus: Record<BonusGrantStatus, number>
}

export interface UserGrantsEnvelope {
  success: boolean
  grants: BonusGrantRow[]
  creditBalance: number
  balance: number
}

export interface PromoListEnvelope {
  success: boolean
  rows: PromoCodeRow[]
}
