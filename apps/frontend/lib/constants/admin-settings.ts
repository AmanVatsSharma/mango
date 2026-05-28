/**
 * @file admin-settings.ts
 * @module admin-settings
 * @description Shared admin SystemSettings keys used by client and server modules.
 * @author StockTrade
 * @created 2026-02-17
 */

export const ADMIN_SETTING_KEYS = {
  /** Boolean: Enable simple registration (name + password + mPIN only, no email/phone). */
  SIMPLE_REGISTRATION_ENABLED: "simple_registration_enabled",
  /** JSON blob: MarketDisplayConfigV1 (jitter, interpolation, segments, freshness, UI policy). */
  MARKET_DISPLAY_CONFIG_V1: "market_display_config_v1",
  /** JSON blob: ClientRmDisplayPolicyV1 (RM card visibility, per-field REAL/HIDDEN/PLATFORM, WhatsApp policy). */
  CLIENT_RM_DISPLAY_POLICY_V1: "client_rm_display_policy_v1",
  ACTIVE_USER_CLASSIFICATION_ENABLED: "active_user_classification_enabled",
  ACTIVE_USER_LOW_BALANCE_THRESHOLD: "active_user_low_balance_threshold",
  ACTIVE_USER_INACTIVITY_DAYS: "active_user_inactivity_days",
  CLEANUP_AUTO_ENABLED: "cleanup_auto_enabled",
  CLEANUP_RETENTION_DAYS: "cleanup_retention_days",
  CLEANUP_DAILY_RUN_HOUR_IST: "cleanup_daily_run_hour_ist",
  CLEANUP_LAST_RUN_DATE_IST: "cleanup_last_run_date_ist",
  CLEANUP_LAST_RUN_SUMMARY: "cleanup_last_run_summary",
  /** JSON blob: OrderChargesConfigV1 (non-brokerage statutory + custom charges). */
  ORDER_CHARGES_CONFIG_V1: "order_charges_config_v1",
  /** JSON blob: SessionSecurityPolicyV1 (concurrent sessions, network clustering, enforcement). */
  SESSION_SECURITY_POLICY_V1: "session_security_policy_v1",
  /** JSON blob: BidAskSpreadConfigV1 (per-segment min/max spread % for synthetic bid/ask display and order execution). */
  BID_ASK_SPREAD_CONFIG_V1: "bid_ask_spread_config_v1",
  /** JSON blob: MarketControlConfigV1 (unified super-controls: spread, slippage, order behaviour, anti-scalp, price tilt, kill switches). */
  MARKET_CONTROL_CONFIG_V1: "market_control_config_v1",
  /** Prefix for audit-log rows in SystemSettings: `market_control_audit:{iso-ts}`. */
  MARKET_CONTROL_AUDIT_PREFIX: "market_control_audit:",
  /** JSON blob: MarketCatalogV1 — admin-curated lists (Indices, Sectors, Options-chain recipes) shown to users in the watchlist Add drawer. */
  MARKET_CATALOG_V1: "market_catalog_v1",
  /** JSON blob: MarketCatalogV1 per-user-segment override. v1.5 reserve — schema lane is owned by `SystemSettings.ownerId`; UI deferred. */
  MARKET_CATALOG_V1_OVERRIDE: "market_catalog_v1_override",
  /** Prefix for audit-log rows in SystemSettings: `market_catalog_audit:{iso-ts}`. */
  MARKET_CATALOG_AUDIT_PREFIX: "market_catalog_audit:",
} as const

export const ADMIN_SETTING_CATEGORIES = {
  ANALYTICS: "ANALYTICS",
  CLEANUP: "CLEANUP",
  SECURITY: "SECURITY",
  MARKET_DATA: "MARKET_DATA",
} as const
