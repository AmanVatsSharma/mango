/**
 * @file types.ts
 * @module session-security
 * @description Versioned session security policy and related enums for the session registry.
 * @author StockTrade
 * @created 2026-03-28
 */

export type NetworkClusterMode = "IP_HASH" | "SUBNET24" | "IP_HASH_WITH_ASN"

export type MultiAccountAction = "ALERT" | "STEP_UP" | "BLOCK_SIGNUP" | "BLOCK_LOGIN"

export type ConcurrentSessionPolicy = "EVICT_OLDEST" | "REJECT_NEW"

export type IncidentSeveritySetting = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"

export interface SessionSecurityPolicyV1 {
  version: 1
  enabled: boolean
  maxConcurrentSessions: number
  sessionIdleTtlMinutes: number
  networkClusterMode: NetworkClusterMode
  multiAccountDistinctUserThreshold: number
  multiAccountLookbackHours: number
  multiAccountAction: MultiAccountAction
  concurrentSessionPolicy: ConcurrentSessionPolicy
  /** When true and policy uses STEP_UP, login requires MPIN verification via challenge before jti is minted. */
  stepUpRequiresMpin: boolean
  /** Skip creating a new incident if same type/network (or concurrent user) fired within this window. */
  incidentCooldownMinutes: number
  /** Delete resolved incidents older than N days (0 = disabled). Run via cron. */
  resolvedIncidentRetentionDays: number
  /** Override default severity for MULTI_USER_SAME_NETWORK incidents. */
  clusterIncidentSeverity?: IncidentSeveritySetting
  /** Override default severity for CONCURRENT_SESSIONS_EXCEEDED incidents. */
  concurrentIncidentSeverity?: IncidentSeveritySetting
}
