/**
 * File:        apps/broker-admin/src/lib/types.ts
 * Module:      broker-admin · Domain Types
 * Purpose:     All entity TypeScript types for the Broker Admin app — used by mock data, context, and every module component
 *
 * ⚠️  NOTE: Order-related types below use Title Case (e.g. 'Buy', 'Market', 'Open')
 * and do NOT match the shared canonical types at libs/shared/types/src/index.ts which use
 * SCREAMING_SNAKE_CASE (e.g. 'BUY', 'MARKET', 'PENDING'). Mixing these two conventions
 * will cause silent type errors at API boundaries. Prefer importing OrderSide/OrderType/OrderStatus
 * from @mango/shared-types and use the Title Case variants only for display/UI label purposes.
 *
 * Exports:
 *   - Client, KYCDocument, Note
 *   - IntroducingBroker, ClientGroup
 *   - Instrument, PricingRule, TradingSession, Order
 *   - RiskMetric, ExposureLimit, SurveillanceAlert, AMLCase
 *   - Transaction, IBCommission, Bonus, PnLEntry
 *   - ReportDefinition, ScheduledReport
 *   - TeamMember, Role, Permission, AuditLogEntry
 *   - Notification, BrokerConfig, SystemStatus
 *   - NavGroup, NavItem (sidebar navigation)
 *   - RevenuePoint, ActivityEvent (dashboard charts)
 *
 * Side-effects:
 *   - none
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

// ─── NAVIGATION ────────────────────────────────────────────────────────────────

export interface NavItem {
  id: string;
  label: string;
  href: string;
  badge?: string;
  badgeWarn?: boolean;
}

export interface NavGroup {
  section: string;
  items: NavItem[];
}

// ─── BROKER CONFIG ─────────────────────────────────────────────────────────────

export interface BrokerConfig {
  name: string;
  legalName: string;
  jurisdiction: string;
  licenseNumber: string;
  currency: string;
  aum: number;
  totalClients: number;
  version: string;
  systemStatus: 'operational' | 'degraded' | 'down';
  adminUser: {
    name: string;
    role: string;
    lastLogin: string;
    avatar?: string;
  };
}

// ─── SYSTEM STATUS ─────────────────────────────────────────────────────────────

export interface SystemStatus {
  service: string;
  status: 'operational' | 'degraded' | 'down';
  latency?: number;
  uptime?: number;
}

// ─── NOTIFICATION ──────────────────────────────────────────────────────────────

export type NotificationType = 'critical' | 'warning' | 'info' | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  time: string;
  read: boolean;
  moduleId?: string;
}

// ─── NOTE ──────────────────────────────────────────────────────────────────────

export interface Note {
  author: string;
  time: string;
  text: string;
}

// ─── KYC DOCUMENT ─────────────────────────────────────────────────────────────

export type KYCLevel = 'Basic' | 'Standard' | 'Enhanced';
export type KYCStatus = 'Pending' | 'In Review' | 'Verified' | 'Rejected' | 'Expired';

export interface KYCDocument {
  id: string;
  clientId: string;
  clientName?: string;
  flag?: string;
  country?: string;
  clientType?: string;
  type: 'Passport' | 'ID Card' | 'Utility Bill' | 'Bank Statement' | 'Selfie';
  status: KYCStatus;
  level: KYCLevel;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  expiryDate?: string;
  notes?: string;
}

// ─── CLIENT ────────────────────────────────────────────────────────────────────

export type ClientType = 'Retail' | 'Pro' | 'VIP' | 'Institutional';
export type ClientStatus = 'Active' | 'Pending' | 'Suspended' | 'Dormant' | 'Closed';
export type RiskProfile = 'Conservative' | 'Moderate' | 'Aggressive';
export type Suitability = 'APPROPRIATE' | 'PENDING' | 'NOT_APPROPRIATE';

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  flag: string;
  dob: string;
  nationality: string;
  address: string;
  type: ClientType;
  group: string;
  status: ClientStatus;
  kyc: KYCStatus;
  kycLevel: KYCLevel;
  kycExpiry: string | null;
  balance: number;
  equity: number;
  margin: number;
  marginPct: number | null;
  floatPnl: number;
  openPositions: number;
  totalDeposited: number;
  totalWithdrawn: number;
  bonusBalance: number;
  credit: number;
  leverage: string;
  accountCurrency: string;
  regDate: string;
  lastLogin: string;
  volumeMTD: number;
  platform: string[];
  suitability: Suitability;
  riskProfile: RiskProfile;
  ib: string | null;
  tags: string[];
  amlScore: number;
  amlStatus: 'Clear' | 'Review' | 'Flagged';
  notes: Note[];
}

// ─── INTRODUCING BROKER ────────────────────────────────────────────────────────

export interface IntroducingBroker {
  id: string;
  name: string;
  email: string;
  country: string;
  flag: string;
  status: 'Active' | 'Pending' | 'Suspended';
  clientCount: number;
  volumeMTD: number;
  commissionMTD: number;
  commissionTotal: number;
  commissionRate: number;
  tier: 'Standard' | 'Silver' | 'Gold' | 'Platinum';
  regDate: string;
  lastPayout: string;
  pendingPayout: number;
}

// ─── CLIENT GROUP ──────────────────────────────────────────────────────────────

export interface ClientGroup {
  id: string;
  name: string;
  description: string;
  clientCount: number;
  leverage: string;
  commissionType: 'Spread' | 'Per Lot' | 'Mixed';
  swapFree: boolean;
  bonusEligible: boolean;
  color: string;
}

// ─── INSTRUMENT ────────────────────────────────────────────────────────────────

export type AssetClass = 'Forex' | 'Indices' | 'Commodities' | 'Crypto' | 'Stocks' | 'ETF';

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  status: 'Active' | 'Disabled' | 'Halted';
  spread: number;
  spreadType: 'Fixed' | 'Variable';
  minLot: number;
  maxLot: number;
  lotStep: number;
  leverage: string;
  swapLong: number;
  swapShort: number;
  digits: number;
  contractSize: number;
  openPositions: number;
  volumeToday: number;
}

// ─── PRICING RULE ─────────────────────────────────────────────────────────────

export interface PricingRule {
  id: string;
  name: string;
  instruments: string[];
  clientGroups: string[];
  markupBid: number;
  markupAsk: number;
  commissionPerLot: number;
  status: 'Active' | 'Inactive';
  priority: number;
}

// ─── TRADING SESSION ──────────────────────────────────────────────────────────

export interface TradingSession {
  id: string;
  name: string;
  instruments: string[];
  openTime: string;
  closeTime: string;
  timezone: string;
  days: string[];
  status: 'Open' | 'Closed' | 'Break' | 'Holiday';
  preMarket?: boolean;
  afterHours?: boolean;
}

// ─── ORDER ────────────────────────────────────────────────────────────────────

export type OrderType = 'Market' | 'Limit' | 'Stop' | 'Stop Limit';
export type OrderSide = 'Buy' | 'Sell';
export type OrderStatus = 'Open' | 'Pending' | 'Filled' | 'Cancelled' | 'Rejected' | 'Expired';

export interface Order {
  id: string;
  clientId: string;
  clientName: string;
  symbol: string;
  type: OrderType;
  side: OrderSide;
  status: OrderStatus;
  lots: number;
  openPrice: number;
  currentPrice?: number;
  closePrice?: number;
  sl?: number;
  tp?: number;
  commission: number;
  swap: number;
  floatPnl?: number;
  realizedPnl?: number;
  openTime: string;
  closeTime?: string;
  comment?: string;
}

// ─── RISK ─────────────────────────────────────────────────────────────────────

export interface RiskMetric {
  symbol: string;
  netExposure: number;
  grossExposure: number;
  longExposure: number;
  shortExposure: number;
  clientCount: number;
  maxDrawdown: number;
  hedgeRatio: number;
  bookType: 'A-Book' | 'B-Book' | 'Hybrid';
}

export interface ExposureLimit {
  id: string;
  symbol: string;
  maxNetExposure: number;
  currentNetExposure: number;
  utilizationPct: number;
  alertThreshold: number;
  hardLimit: number;
  status: 'Normal' | 'Warning' | 'Breach';
}

export type AlertSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type AlertPattern =
  | 'Layering'
  | 'Spoofing'
  | 'Wash Trading'
  | 'Front Running'
  | 'Churning'
  | 'Price Manipulation'
  | 'Account Takeover';

export interface SurveillanceAlert {
  id: string;
  clientId: string;
  clientName: string;
  pattern: AlertPattern;
  severity: AlertSeverity;
  status: 'Open' | 'Under Review' | 'Resolved' | 'Escalated';
  description: string;
  detectedAt: string;
  trades: string[];
  assignedTo?: string;
  resolution?: string;
}

export interface AMLCase {
  id: string;
  clientId: string;
  clientName: string;
  score: number;
  triggers: string[];
  status: 'Clear' | 'Review' | 'Suspicious' | 'Reported';
  lastChecked: string;
  flaggedTransactions: string[];
  notes: Note[];
}

// ─── FINANCE ──────────────────────────────────────────────────────────────────

export type TransactionType = 'Deposit' | 'Withdrawal' | 'Transfer' | 'Adjustment' | 'Bonus' | 'Commission';
export type TransactionStatus = 'Pending' | 'Processing' | 'Completed' | 'Rejected' | 'Cancelled' | 'On Hold';

export interface Transaction {
  id: string;
  clientId: string;
  clientName: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;
  method: string;
  reference: string;
  createdAt: string;
  processedAt?: string;
  notes?: string;
  flagged?: boolean;
}

export interface IBCommission {
  id: string;
  ibId: string;
  ibName: string;
  period: string;
  clientCount: number;
  volume: number;
  commissionEarned: number;
  status: 'Pending' | 'Approved' | 'Paid' | 'On Hold';
  payoutDate?: string;
  method: string;
}

export interface Bonus {
  id: string;
  name: string;
  type: 'Welcome' | 'Deposit' | 'No Deposit' | 'Loyalty' | 'Referral' | 'Cashback' | 'Contest';
  status: 'Active' | 'Inactive' | 'Expired' | 'Scheduled';
  amount: number;
  amountType: 'Fixed' | 'Percentage';
  minDeposit?: number;
  maxBonus?: number;
  turnoverMultiple: number;
  claimedCount: number;
  totalAwarded: number;
  startDate: string;
  endDate?: string;
  eligibleGroups: string[];
}

export interface PnLEntry {
  date: string;
  spread: number;
  commission: number;
  swap: number;
  bonusCost: number;
  ibCost: number;
  netRevenue: number;
  totalClients: number;
  newClients: number;
  deposits: number;
  withdrawals: number;
}

// ─── REPORTS ──────────────────────────────────────────────────────────────────

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  type: 'Client' | 'Trading' | 'Risk' | 'Finance' | 'Compliance' | 'Custom';
  columns: string[];
  filters: Record<string, unknown>;
  lastRun?: string;
  createdBy: string;
  format: 'CSV' | 'Excel' | 'PDF';
}

export interface ScheduledReport {
  id: string;
  reportId: string;
  reportName: string;
  schedule: 'Daily' | 'Weekly' | 'Monthly';
  nextRun: string;
  lastRun?: string;
  recipients: string[];
  status: 'Active' | 'Paused';
}

// ─── TEAM ─────────────────────────────────────────────────────────────────────

export interface Permission {
  module: string;
  actions: ('read' | 'write' | 'delete' | 'approve')[];
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  memberCount: number;
  isSystem: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'Active' | 'Inactive' | 'Locked';
  lastLogin: string;
  createdAt: string;
  twoFAEnabled: boolean;
  ipRestricted: boolean;
  allowedIPs?: string[];
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  actorRole: string;
  action: string;
  module: string;
  target?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip: string;
  timestamp: string;
  severity: 'Info' | 'Warning' | 'Critical';
}

// ─── CHARTS / DASHBOARD ────────────────────────────────────────────────────────

export interface RevenuePoint {
  label: string;
  spread: number;
  commission: number;
  swap: number;
  bonusCost: number;
  total: number;
}

export interface ActivityEvent {
  id: string;
  type: 'deposit' | 'withdrawal' | 'trade' | 'kyc' | 'alert' | 'login' | 'registration';
  message: string;
  clientName?: string;
  amount?: number;
  symbol?: string;
  time: string;
}

export interface HeatmapCell {
  hour: number;
  day: string;
  value: number;
}
