/**
 * @file components/admin-v2/bonuses/index.ts
 * @module admin-v2/bonuses
 * @description Barrel exports for the Bonus / Credit / Promo module.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export { BonusesWorkbench } from "./bonuses-workbench"
export { RulesList } from "./rules-list"
export { GrantsFeed } from "./grants-feed"
export { BulkIssueForm } from "./bulk-issue-form"
export { PromoList } from "./promo-list"
export { RuleForm } from "./rule-form"
export {
  useBonusGrants,
  useBonusRules,
  usePromoCodes,
  useUserBonusGrants,
} from "./hooks"
export type {
  BonusGrantRow,
  BonusGrantStatus,
  BonusKind,
  BonusRuleInput,
  BonusRuleRow,
  GrantsListEnvelope,
  PromoCodeRow,
  RulesListEnvelope,
  UserGrantsEnvelope,
} from "./types"
export { BONUS_KIND_META, GRANT_STATUS_META } from "./types"
