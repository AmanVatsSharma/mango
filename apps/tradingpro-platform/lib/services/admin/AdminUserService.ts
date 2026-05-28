/**
 * @file AdminUserService.ts
 * @module admin-console
 * @description Comprehensive admin user management service with full CRUD operations, KYC management, credential resets, activity tracking, and risk management
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-05-07 — getUserDetails: added sessionCount (active UserSessionRecord count, not revoked & not expired).
 *
 * Notes:
 * - Admin create/update normalizes email (lower+trim) and phone (digits / IN national) via `user-contact-canonical` for parity with login and duplicate detection.
 * - `getUserStatementPayload` powers `GET /api/admin/users/[userId]/statement` (ledger-first merge, count-reconciled fetch, running balances).
 * - Statement annex rows include `instrumentLabel` from linked `Stock` for register clarity.
 */

import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { Role, KycStatus, OrderStatus } from "@prisma/client"
import { AppError } from "@/src/common/errors"
import { TradingLogger } from "@/lib/services/logging/TradingLogger"
import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"
import {
  activeHeadcountBaseWhere,
  attachEligibilityPolicyDormantFlags,
  getActiveUserCountPolicyConfig,
  resolveActiveUserCountWhere,
} from "@/lib/server/active-user-count-policy"
import { invalidateAllLoginSessionsForUser } from "@/lib/auth/account-session-invalidate"
import bcrypt from "bcryptjs"
import {
  applyRunningBalancesAndSortDesc,
  buildStatementLinesFromEntities,
  groupStatementEvents,
  computeFundsWindowMeta,
  toAdminStatementRow,
  type AdminStatementApiRow,
} from "@/lib/services/admin/admin-user-statement-build"
import { formatInstrumentSummary } from "@/lib/market-data/instrument-summary"
import {
  StatementAggregationService,
  type StatementManifest,
} from "@/lib/services/statement/statement-aggregation.service"
import {
  batchAdminRelatedContactCounts,
  fetchAdminUserIdsWithContactOverlap,
} from "@/lib/server/admin-related-users"
import {
  canonicalEmailForPersistence,
  canonicalPhoneForPersistence,
} from "@/lib/identity/user-contact-canonical"

console.log("👥 [ADMIN-USER-SERVICE] Module loaded")

const normalizeAdminUserMetricNumber = (value: unknown): number => parseFiniteMarketNumber(value) ?? 0

const ADMIN_UPDATABLE_ROLES: readonly Role[] = [
  Role.USER,
  Role.MODERATOR,
  Role.ADMIN,
  Role.SUPER_ADMIN,
] as const

function isAdminBodyRole(value: unknown): value is Role {
  return typeof value === "string" && (ADMIN_UPDATABLE_ROLES as readonly string[]).includes(value)
}

export interface UserSummary {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  role: Role
  isActive: boolean
  suspendedAt: string | null
  eligibilityPolicyDormant: boolean
  kycStatus: string
  /** Present when a `KYC` row exists (admin CRM / deep-link to KYC queue). */
  kycId?: string | null
  /** True when PAN, Aadhaar, and bank proof are all non-empty on the KYC row. */
  kycDocumentsSubmitted?: boolean
  emailVerified?: string | null
  phoneVerified?: string | null
  managedById?: string | null
  tradingAccount: {
    id: string
    balance: number
    availableMargin: number
    usedMargin: number
  } | null
  createdAt: Date
  stats: {
    totalOrders: number
    activePositions: number
    totalDeposits: number
    totalWithdrawals: number
  }
  /** Other users with same normalized email (global or RM-scoped when loaded under MODERATOR list). */
  relatedEmailCount?: number
  /** Other users with same normalized phone tail (global or RM-scoped). */
  relatedPhoneCount?: number
}

/** Prisma list row shape for `getAllUsers` / `getUsersWithFilters` / `getUsersByRM` before related-contact counts. */
type AdminUserListDbRow = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  role: Role
  isActive: boolean
  suspendedAt: Date | null
  emailVerified: Date | null
  phoneVerified: Date | null
  managedById: string | null
  eligibilityPolicyDormant: boolean
  createdAt: Date
  tradingAccount: {
    id: string
    balance: unknown
    availableMargin: unknown
    usedMargin: unknown
    _count?: { orders: number; positions: number }
  } | null
  kyc: {
    id: string
    status: KycStatus
    panNumber: string
    aadhaarNumber: string
    bankProofUrl: string
  } | null
  deposits: Array<{ amount: unknown }>
  withdrawals: Array<{ amount: unknown }>
}

function kycDocumentsSubmittedFromRow(kyc: AdminUserListDbRow["kyc"]): boolean {
  if (!kyc) return false
  const pan = (kyc.panNumber ?? "").trim()
  const aadhaar = (kyc.aadhaarNumber ?? "").trim()
  const bank = (kyc.bankProofUrl ?? "").trim()
  return pan.length > 0 && aadhaar.length > 0 && bank.length > 0
}

function mapAdminUserListDbRowToSummary(
  user: AdminUserListDbRow,
): Omit<UserSummary, "relatedEmailCount" | "relatedPhoneCount"> {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    clientId: user.clientId,
    role: user.role,
    isActive: user.isActive,
    suspendedAt: user.suspendedAt ? user.suspendedAt.toISOString() : null,
    eligibilityPolicyDormant: user.eligibilityPolicyDormant,
    kycStatus: user.kyc?.status ?? "NOT_SUBMITTED",
    kycId: user.kyc?.id ?? null,
    kycDocumentsSubmitted: kycDocumentsSubmittedFromRow(user.kyc),
    emailVerified: user.emailVerified ? user.emailVerified.toISOString() : null,
    phoneVerified: user.phoneVerified ? user.phoneVerified.toISOString() : null,
    managedById: user.managedById,
    tradingAccount: user.tradingAccount
      ? {
          id: user.tradingAccount.id,
          balance: normalizeAdminUserMetricNumber(user.tradingAccount.balance),
          availableMargin: normalizeAdminUserMetricNumber(user.tradingAccount.availableMargin),
          usedMargin: normalizeAdminUserMetricNumber(user.tradingAccount.usedMargin),
        }
      : null,
    createdAt: user.createdAt,
    stats: {
      totalOrders: user.tradingAccount?._count?.orders ?? 0,
      activePositions: user.tradingAccount?._count?.positions ?? 0,
      totalDeposits: user.deposits.reduce((s, d) => s + normalizeAdminUserMetricNumber(d.amount), 0),
      totalWithdrawals: user.withdrawals.reduce((s, w) => s + normalizeAdminUserMetricNumber(w.amount), 0),
    },
  }
}

export type AdminUserStatementOptions = {
  dateFrom?: Date
  dateTo?: Date
  /** Per-entity fetch cap (orders, transactions, deposits, withdrawals); clamped server-side. */
  limit?: number
}

/** Executed-order annex for admin UI (no cash column — notional-only rows removed from main ledger tab). */
export type AdminTradeRegisterAnnexRow = {
  id: string
  symbol: string
  orderSide: string
  quantity: number
  filledQuantity: number
  averagePrice: number | null
  executedAt: string | null
  createdAt: string
  status: string
}

export type AdminUserStatementPayload = {
  user: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    clientId: string | null
    isActive: boolean
    kycStatus: string
    createdAt: string
  }
  tradingAccount: {
    id: string
    balance: number
    availableMargin: number
    usedMargin: number
    createdAt: string
  } | null
  rows: AdminStatementApiRow[]
  truncated: boolean
  balanceDisclaimer: "full" | "partial"
  counts: {
    orders: number
    transactions: number
    deposits: number
    withdrawals: number
  }
  returned: {
    orders: number
    transactions: number
    deposits: number
    withdrawals: number
  }
  executedOrdersTotal: number
  /** Present when the statement was built via full aggregation (count-reconciled fetch). */
  manifest?: StatementManifest
  /** Full executed-order register for the window (separate tab; execution facts, not cash settlement). */
  tradeRegisterAnnex: AdminTradeRegisterAnnexRow[]
  /** Grouped activity (order-linked lines + standalone funds/ledger). */
  events: AdminStatementEventPayload[]
  /** Opening/closing funds; opening margin fields null without snapshots. */
  funds: {
    opening: { balance: number; availableMargin: number | null; usedMargin: number | null }
    closing: { balance: number; availableMargin: number; usedMargin: number }
    cashStreamTotals: { netCashInWindow: number }
  } | null
  /** Reconciliation and data-quality notices. */
  manifestWarnings: string[]
}

export type AdminStatementEventPayload = {
  id: string
  kind: string
  dateIso: string
  primary: AdminStatementApiRow
  children: AdminStatementApiRow[]
}

export class AdminUserService {
  private logger: TradingLogger

  constructor(logger?: TradingLogger) {
    this.logger = logger || new TradingLogger({ clientId: 'ADMIN' })
    console.log("🏗️ [ADMIN-USER-SERVICE] Service instance created")
  }

  private async applyRelatedContactCounts(
    users: UserSummary[],
    bookScopedRmId: string | null,
  ): Promise<UserSummary[]> {
    if (users.length === 0) {
      return users
    }
    const map = await batchAdminRelatedContactCounts(
      prisma,
      users.map((u) => u.id),
      bookScopedRmId,
    )
    return users.map((u) => {
      const c = map.get(u.id) ?? { relatedEmailCount: 0, relatedPhoneCount: 0 }
      return {
        ...u,
        relatedEmailCount: c.relatedEmailCount,
        relatedPhoneCount: c.relatedPhoneCount,
      }
    })
  }

  /**
   * Get all users with summary
   */
  async getAllUsers(
    page: number = 1,
    limit: number = 50,
    search?: string,
    options?: { contactDuplicate?: boolean },
  ): Promise<{ users: UserSummary[]; total: number; pages: number }> {
    const contactDuplicate = options?.contactDuplicate ?? false
    console.log("📋 [ADMIN-USER-SERVICE] Fetching all users:", { page, limit, search, contactDuplicate })

    const skip = (page - 1) * limit

    const baseWhere = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
            { clientId: { contains: search, mode: 'insensitive' as const } }
          ]
        }
      : {}

    let overlapIds: string[] | undefined
    if (contactDuplicate) {
      overlapIds = await fetchAdminUserIdsWithContactOverlap(prisma, null)
    }

    const where =
      overlapIds !== undefined
        ? {
            ...baseWhere,
            id: { in: overlapIds }
          }
        : baseWhere

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          tradingAccount: {
            select: {
              id: true,
              balance: true,
              availableMargin: true,
              usedMargin: true,
              _count: {
                select: {
                  orders: true,
                  positions: { where: { quantity: { not: 0 } } }
                }
              }
            }
          },
          kyc: {
            select: {
              id: true,
              status: true,
              panNumber: true,
              aadhaarNumber: true,
              bankProofUrl: true,
            }
          },
          deposits: {
            where: { status: 'COMPLETED' },
            select: {
              amount: true
            }
          },
          withdrawals: {
            where: { status: 'COMPLETED' },
            select: {
              amount: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.user.count({ where })
    ])

    console.log(`✅ [ADMIN-USER-SERVICE] Found ${users.length} users (total: ${total})`)

    const policyCfg = await getActiveUserCountPolicyConfig()
    const withDormant = await attachEligibilityPolicyDormantFlags(users, policyCfg)

    const userSummaries: UserSummary[] = withDormant.map((user) =>
      mapAdminUserListDbRowToSummary(user as unknown as AdminUserListDbRow),
    )

    const withRelated = await this.applyRelatedContactCounts(userSummaries, null)

    return {
      users: withRelated,
      total,
      pages: Math.ceil(total / limit)
    }
  }

  /**
   * Get user details with full activity
   */
  async getUserDetails(userId: string) {
    console.log("🔍 [ADMIN-USER-SERVICE] Fetching user details:", userId)

    const [user, depositAgg, withdrawalAgg, sessionCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          tradingAccount: {
            include: {
              orders: {
                take: 20,
                orderBy: { createdAt: 'desc' }
              },
              positions: {
                where: { quantity: { not: 0 } }
              },
              trades: {
                take: 50,
                orderBy: { createdAt: 'desc' }
              }
            }
          },
          kyc: true,
          managedBy: {
            select: { id: true, name: true, email: true },
          },
          referredBy: {
            select: { id: true, clientId: true, name: true, email: true },
          },
          deposits: {
            take: 10,
            orderBy: { createdAt: 'desc' }
          },
          withdrawals: {
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              bankAccount: {
                select: {
                  id: true,
                  bankName: true,
                  accountNumber: true,
                  ifscCode: true,
                  accountHolderName: true,
                  accountType: true,
                  isDefault: true,
                  isActive: true,
                  createdAt: true,
                },
              },
            },
          },
          bankAccounts: true
        }
      }),
      // All-time deposit total (COMPLETED only — money that actually landed)
      prisma.deposit.aggregate({
        where: { userId, status: 'COMPLETED' },
        _sum: { amount: true },
        _count: true,
      }),
      // All-time withdrawal total (COMPLETED only)
      prisma.withdrawal.aggregate({
        where: { userId, status: 'COMPLETED' },
        _sum: { amount: true },
        _count: true,
      }),
      // Active session count (not revoked, not expired)
      prisma.userSessionRecord.count({
        where: {
          userId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
    ])

    if (!user) {
      console.error("❌ [ADMIN-USER-SERVICE] User not found:", userId)
      throw new Error("User not found")
    }

    // Realized P&L: net of all transactions linked to positions (CREDIT = profit, DEBIT = loss)
    let realizedPnl = 0
    if (user.tradingAccount) {
      const [pnlCredits, pnlDebits] = await Promise.all([
        prisma.transaction.aggregate({
          where: { tradingAccountId: user.tradingAccount.id, positionId: { not: null }, type: 'CREDIT' },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: { tradingAccountId: user.tradingAccount.id, positionId: { not: null }, type: 'DEBIT' },
          _sum: { amount: true },
        }),
      ])
      realizedPnl = normalizeAdminUserMetricNumber(pnlCredits._sum.amount) - normalizeAdminUserMetricNumber(pnlDebits._sum.amount)
    }

    console.log("✅ [ADMIN-USER-SERVICE] User details retrieved")
    return {
      ...user,
      sessionCount,
      financialSummary: {
        totalDeposits: normalizeAdminUserMetricNumber(depositAgg._sum.amount),
        depositCount: depositAgg._count,
        totalWithdrawals: normalizeAdminUserMetricNumber(withdrawalAgg._sum.amount),
        withdrawalCount: withdrawalAgg._count,
        realizedPnl,
      },
    }
  }

  /**
   * Full statement rows for admin review: higher caps than getUserDetails, optional date window, ledger-first dedupe, running balances.
   */
  async getUserStatementPayload(userId: string, opts: AdminUserStatementOptions = {}): Promise<AdminUserStatementPayload | null> {
    const dateFrom = opts.dateFrom
    const dateTo = opts.dateTo

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        clientId: true,
        isActive: true,
        createdAt: true,
        kyc: { select: { status: true } },
        tradingAccount: {
          select: {
            id: true,
            balance: true,
            availableMargin: true,
            usedMargin: true,
            createdAt: true,
          },
        },
      },
    })

    if (!user) {
      return null
    }

    const ta = user.tradingAccount
    if (!ta) {
      const kycStatus = user.kyc?.status || "NOT_SUBMITTED"
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          clientId: user.clientId,
          isActive: user.isActive,
          kycStatus,
          createdAt: user.createdAt.toISOString(),
        },
        tradingAccount: null,
        rows: [],
        truncated: false,
        balanceDisclaimer: "full",
        counts: { orders: 0, transactions: 0, deposits: 0, withdrawals: 0 },
        returned: { orders: 0, transactions: 0, deposits: 0, withdrawals: 0 },
        executedOrdersTotal: 0,
        tradeRegisterAnnex: [],
        events: [],
        funds: null,
        manifestWarnings: [],
      }
    }

    const end = dateTo ?? new Date()
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000
    const start = dateFrom ?? new Date(end.getTime() - ninetyDaysMs)

    const executedOrdersTotal = await prisma.order.count({
      where: { tradingAccountId: ta.id, status: OrderStatus.EXECUTED },
    })

    const agg = await StatementAggregationService.buildForUser(userId, start, end)

    const ordersSlice = agg.executedOrders.map((o) => {
      const st = o.Stock
      const instrumentLabel = formatInstrumentSummary({
        symbol: o.symbol,
        exchange: st?.exchange,
        segment: st?.segment,
        name: st?.name,
        strikePrice: st?.strikePrice,
        optionType: st?.optionType,
        expiry: st?.expiry,
        lotSize: st?.lot_size,
      })
      return {
        id: o.id,
        symbol: o.symbol,
        instrumentLabel,
        orderSide: o.orderSide,
        quantity: o.quantity,
        filledQuantity: o.filledQuantity,
        price: o.price,
        averagePrice: o.averagePrice,
        status: o.status,
        executedAt: o.executedAt,
        createdAt: o.createdAt,
      }
    })

    const transactionsSlice = agg.ledger.map((t) => ({
      id: t.id,
      amount: t.amount,
      type: t.type,
      description: t.description,
      createdAt: t.createdAt,
      orderId: t.orderId,
      positionId: t.positionId ?? null,
    }))

    const depositsSlice = agg.deposits.map((d) => ({
      id: d.id,
      amount: d.amount,
      method: d.method,
      utr: d.utr,
      status: d.status,
      createdAt: d.createdAt,
      processedAt: d.processedAt,
    }))

    const withdrawalsSlice = agg.withdrawals.map((w) => ({
      id: w.id,
      amount: w.amount,
      charges: w.charges,
      reference: w.reference,
      status: w.status,
      createdAt: w.createdAt,
      processedAt: w.processedAt,
    }))

    const built = buildStatementLinesFromEntities({
      orders: ordersSlice,
      transactions: transactionsSlice,
      deposits: depositsSlice,
      withdrawals: withdrawalsSlice,
    })

    const baseRows = built.lines.map(toAdminStatementRow)
    const currentBalance = normalizeAdminUserMetricNumber(ta.balance)
    const rows = applyRunningBalancesAndSortDesc(baseRows, currentBalance)
    const cashBalanceByRowId = new Map(rows.map((r) => [r.id, r.balance]))
    const availM = normalizeAdminUserMetricNumber(ta.availableMargin)
    const usedM = normalizeAdminUserMetricNumber(ta.usedMargin)
    const fundsMeta = computeFundsWindowMeta({
      lines: built.lines,
      closing: { balance: currentBalance, availableMargin: availM, usedMargin: usedM },
    })
    const funds = {
      opening: fundsMeta.opening,
      closing: { balance: currentBalance, availableMargin: availM, usedMargin: usedM },
      cashStreamTotals: fundsMeta.cashStreamTotals,
    }

    const events: AdminStatementEventPayload[] = groupStatementEvents(built.lines).map((g) => {
      const primary = toAdminStatementRow(g.primary)
      const children = g.children.map(toAdminStatementRow)
      return {
        id: g.id,
        kind: g.kind,
        dateIso: g.dateIso,
        primary: { ...primary, balance: cashBalanceByRowId.get(primary.id) },
        children: children.map((c) => ({ ...c, balance: cashBalanceByRowId.get(c.id) })),
      }
    })

    const manifestWarnings: string[] = [...built.warnings]
    if (built.dedupedDepositIds.length > 0) {
      manifestWarnings.push(
        `${built.dedupedDepositIds.length} deposit record(s) omitted from the cash list because matching ledger rows already reflect the credit (avoids double-count).`,
      )
    }
    if (built.dedupedWithdrawalIds.length > 0) {
      manifestWarnings.push(
        `${built.dedupedWithdrawalIds.length} withdrawal record(s) omitted from the cash list because matching ledger rows already reflect the debit (avoids double-count).`,
      )
    }

    const userSuppliedWindow = Boolean(dateFrom || dateTo)
    const balanceDisclaimer: "full" | "partial" = userSuppliedWindow ? "partial" : "partial"

    const kycStatus = user.kyc?.status || "NOT_SUBMITTED"
    const m = agg.manifest

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        clientId: user.clientId,
        isActive: user.isActive,
        kycStatus,
        createdAt: user.createdAt.toISOString(),
      },
      tradingAccount: {
        id: ta.id,
        balance: currentBalance,
        availableMargin: normalizeAdminUserMetricNumber(ta.availableMargin),
        usedMargin: normalizeAdminUserMetricNumber(ta.usedMargin),
        createdAt: ta.createdAt.toISOString(),
      },
      rows,
      truncated: false,
      balanceDisclaimer,
      counts: {
        orders: m.counts.executedOrders,
        transactions: m.counts.ledger,
        deposits: m.counts.deposits,
        withdrawals: m.counts.withdrawals,
      },
      returned: {
        orders: ordersSlice.length,
        transactions: transactionsSlice.length,
        deposits: depositsSlice.length,
        withdrawals: withdrawalsSlice.length,
      },
      executedOrdersTotal,
      manifest: m,
      tradeRegisterAnnex: ordersSlice.map((o) => ({
        id: o.id,
        symbol: o.symbol,
        instrumentLabel: o.instrumentLabel,
        orderSide: o.orderSide,
        quantity: o.quantity,
        filledQuantity: o.filledQuantity,
        averagePrice: o.averagePrice != null ? normalizeAdminUserMetricNumber(o.averagePrice) : null,
        executedAt: o.executedAt ? o.executedAt.toISOString() : null,
        createdAt: o.createdAt.toISOString(),
        status: o.status,
      })),
      events,
      funds,
      manifestWarnings,
    }
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    const randomLetters = Array.from({ length: 2 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("")
    const randomNumbers = Math.floor(1000 + Math.random() * 9000)
    return randomLetters + randomNumbers
  }

  /**
   * Create a new user with trading account and KYC
   */
  async createUser(input: {
    name: string
    email: string
    phone: string
    password: string
    initialBalance?: number
  }) {
    const email = canonicalEmailForPersistence(input.email)
    const phone = canonicalPhoneForPersistence(input.phone)
    console.log("👤 [ADMIN-USER-SERVICE] Creating new user:", { email, name: input.name })

    try {
      await this.logger.info("ADMIN_CREATE_USER_START", "Admin creating new user", {
        email,
        name: input.name,
      })

      if (!phone || phone.length < 10) {
        throw new Error("Invalid phone number")
      }

      // Check if email already exists
      const existingEmail = await prisma.user.findUnique({
        where: { email },
      })
      if (existingEmail) {
        throw new Error("Email already registered")
      }

      // Check if phone already exists
      const existingPhone = await prisma.user.findUnique({
        where: { phone },
      })
      if (existingPhone) {
        throw new Error("Phone number already registered")
      }

      // Generate unique client ID
      let clientId = this.generateClientId()
      let attempts = 0
      while (attempts < 10) {
        const existing = await prisma.user.findUnique({
          where: { clientId }
        })
        if (!existing) break
        clientId = this.generateClientId()
        attempts++
      }
      if (attempts >= 10) {
        throw new Error("Failed to generate unique client ID")
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, 10)

      // Create user, trading account, and KYC in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create user
        const newUser = await tx.user.create({
          data: {
            name: input.name,
            email,
            phone,
            password: hashedPassword,
            clientId,
            role: Role.USER,
            isActive: true,
            emailVerified: new Date(), // Auto-verify for admin-created users
            phoneVerified: new Date(), // Auto-verify for admin-created users
          }
        })

        // Create trading account
        const tradingAccount = await tx.tradingAccount.create({
          data: {
            userId: newUser.id,
            clientId,
            balance: input.initialBalance || 0,
            availableMargin: input.initialBalance || 0,
            usedMargin: 0,
          }
        })

        // Create default KYC record
        await tx.kYC.create({
          data: {
            userId: newUser.id,
            aadhaarNumber: "",
            panNumber: "",
            bankProofUrl: "",
            bankProofKey: null,
            status: KycStatus.PENDING,
          }
        })

        return { user: newUser, tradingAccount }
      })

      await this.logger.info("ADMIN_CREATE_USER_COMPLETED", "User created successfully", {
        userId: result.user.id,
        clientId: result.user.clientId,
        email: result.user.email,
      })

      console.log("✅ [ADMIN-USER-SERVICE] User created successfully:", {
        id: result.user.id,
        clientId: result.user.clientId,
        email: result.user.email,
      })

      return {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        clientId: result.user.clientId,
        tradingAccount: {
          id: result.tradingAccount.id,
          balance: result.tradingAccount.balance,
        },
      }
    } catch (error: any) {
      console.error("❌ [ADMIN-USER-SERVICE] Create user failed:", error)
      await this.logger.error("ADMIN_CREATE_USER_FAILED", error.message, error, { email })
      throw error
    }
  }

  /**
   * Get platform statistics
   */
  async getPlatformStats() {
    console.log("📊 [ADMIN-USER-SERVICE] Fetching platform statistics")
    const { where: activeUserWhere } = await resolveActiveUserCountWhere(activeHeadcountBaseWhere())

    const [
      totalUsers,
      activeUsers,
      totalTradingAccounts,
      totalBalance,
      totalOrders,
      activePositions,
      pendingDeposits,
      pendingWithdrawals,
      pendingKyc,
      kycApproved,
      kycRejected,
      executedOrdersToday,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: activeUserWhere }),
      prisma.tradingAccount.count(),
      prisma.tradingAccount.aggregate({
        _sum: { balance: true, availableMargin: true, usedMargin: true }
      }),
      prisma.order.count(),
      prisma.position.count({ where: { quantity: { not: 0 } } }),
      prisma.deposit.count({ where: { status: 'PENDING' } }),
      prisma.withdrawal.count({ where: { status: 'PENDING' } }),
      prisma.kYC.count({ where: { status: 'PENDING' } }),
      prisma.kYC.count({ where: { status: 'APPROVED' } }),
      prisma.kYC.count({ where: { status: 'REJECTED' } }),
      prisma.order.count({
        where: {
          status: 'EXECUTED',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ])

    const stats = {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers
      },
      tradingAccounts: {
        total: totalTradingAccounts,
        totalBalance: normalizeAdminUserMetricNumber(totalBalance._sum.balance),
        totalAvailableMargin: normalizeAdminUserMetricNumber(totalBalance._sum.availableMargin),
        totalUsedMargin: normalizeAdminUserMetricNumber(totalBalance._sum.usedMargin)
      },
      trading: {
        totalOrders,
        activePositions,
        executedOrdersToday,
      },
      pending: {
        deposits: pendingDeposits,
        withdrawals: pendingWithdrawals,
        kyc: pendingKyc,
      },
      kyc: {
        pending: pendingKyc,
        approved: kycApproved,
        rejected: kycRejected,
      },
    }

    console.log("✅ [ADMIN-USER-SERVICE] Platform statistics:", stats)
    return stats
  }

  /**
   * Update user status
   */
  async updateUserStatus(userId: string, isActive: boolean) {
    console.log("🔄 [ADMIN-USER-SERVICE] Updating user status:", { userId, isActive })

    await this.logger.logSystemEvent("USER_STATUS_UPDATE", `Admin updating user ${userId} status to ${isActive ? 'active' : 'deactivated'}`)

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive }
    })

    if (!isActive) {
      await invalidateAllLoginSessionsForUser(userId)
    }

    console.log("✅ [ADMIN-USER-SERVICE] User status updated")
    return user
  }

  /**
   * Get recent activity across all users
   */
  async getRecentActivity(limit: number = 50) {
    console.log("📋 [ADMIN-USER-SERVICE] Fetching recent activity")

    const [recentOrders, recentDeposits, recentWithdrawals] = await Promise.all([
      prisma.order.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          tradingAccount: {
            include: {
              user: {
                select: {
                  name: true,
                  clientId: true
                }
              }
            }
          }
        }
      }),
      prisma.deposit.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              name: true,
              clientId: true
            }
          }
        }
      }),
      prisma.withdrawal.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              name: true,
              clientId: true
            }
          }
        }
      })
    ])

    // Combine and sort all activities
    const activities = [
      ...recentOrders.map(o => ({
        id: o.id,
        type: 'ORDER',
        user: o.tradingAccount.user?.name || 'Unknown',
        clientId: o.tradingAccount.user?.clientId || '',
        action: `${o.orderSide} ${o.symbol}`,
        amount: normalizeAdminUserMetricNumber(o.price || 0) * o.quantity,
        status: o.status,
        timestamp: o.createdAt
      })),
      ...recentDeposits.map(d => ({
        id: d.id,
        type: 'DEPOSIT',
        user: d.user.name || 'Unknown',
        clientId: d.user.clientId || '',
        action: 'Fund Deposit',
        amount: normalizeAdminUserMetricNumber(d.amount),
        status: d.status,
        timestamp: d.createdAt
      })),
      ...recentWithdrawals.map(w => ({
        id: w.id,
        type: 'WITHDRAWAL',
        user: w.user.name || 'Unknown',
        clientId: w.user.clientId || '',
        action: 'Withdrawal Request',
        amount: normalizeAdminUserMetricNumber(w.amount),
        status: w.status,
        timestamp: w.createdAt
      }))
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit)

    console.log(`✅ [ADMIN-USER-SERVICE] Found ${activities.length} recent activities`)
    return activities
  }

  /**
   * Update user profile information (allowlisted fields only; ignores unknown JSON keys).
   */
  async updateUser(
    userId: string,
    raw: Record<string, unknown>,
    options?: { actorUserId?: string | null },
  ) {
    let priorRequireOtpOnLogin: boolean | undefined
    if (Object.prototype.hasOwnProperty.call(raw, "requireOtpOnLogin")) {
      const v = raw.requireOtpOnLogin
      if (typeof v !== "boolean") {
        throw new AppError({
          code: "INVALID_INPUT",
          message: "requireOtpOnLogin must be a boolean value",
          statusCode: 400,
        })
      }
      const existingOtp = await prisma.user.findUnique({
        where: { id: userId },
        select: { requireOtpOnLogin: true },
      })
      if (!existingOtp) {
        throw new Error("User not found")
      }
      priorRequireOtpOnLogin = existingOtp.requireOtpOnLogin
    }

    const data: Prisma.UserUpdateInput = {
      updatedAt: new Date(),
    }

    if (Object.prototype.hasOwnProperty.call(raw, "name") && raw.name !== undefined) {
      if (typeof raw.name !== "string") {
        throw new AppError({
          code: "INVALID_INPUT",
          message: "name must be a string",
          statusCode: 400,
        })
      }
      data.name = raw.name
    }

    if (Object.prototype.hasOwnProperty.call(raw, "email") && raw.email !== undefined) {
      const emailVal = raw.email
      if (emailVal !== null && typeof emailVal !== "string") {
        throw new AppError({
          code: "INVALID_INPUT",
          message: "email must be a string",
          statusCode: 400,
        })
      }
      data.email = emailVal === null ? null : canonicalEmailForPersistence(emailVal as string)
    }

    if (Object.prototype.hasOwnProperty.call(raw, "phone") && raw.phone !== undefined) {
      const phoneVal = raw.phone
      if (phoneVal !== null && typeof phoneVal !== "string") {
        throw new AppError({
          code: "INVALID_INPUT",
          message: "phone must be a string",
          statusCode: 400,
        })
      }
      data.phone = phoneVal === null ? null : canonicalPhoneForPersistence(phoneVal as string)
    }

    if (Object.prototype.hasOwnProperty.call(raw, "role") && raw.role !== undefined) {
      if (!isAdminBodyRole(raw.role)) {
        throw new AppError({
          code: "INVALID_INPUT",
          message: "role must be a valid role",
          statusCode: 400,
        })
      }
      data.role = raw.role
    }

    if (Object.prototype.hasOwnProperty.call(raw, "isActive") && raw.isActive !== undefined) {
      if (typeof raw.isActive !== "boolean") {
        throw new AppError({
          code: "INVALID_INPUT",
          message: "isActive must be a boolean value",
          statusCode: 400,
        })
      }
      data.isActive = raw.isActive
    }

    if (Object.prototype.hasOwnProperty.call(raw, "bio")) {
      if (raw.bio !== undefined && raw.bio !== null && typeof raw.bio !== "string") {
        throw new AppError({
          code: "INVALID_INPUT",
          message: "bio must be a string or null",
          statusCode: 400,
        })
      }
      data.bio = raw.bio === null || raw.bio === undefined ? undefined : raw.bio
    }

    if (Object.prototype.hasOwnProperty.call(raw, "clientId") && raw.clientId !== undefined) {
      if (typeof raw.clientId !== "string") {
        throw new AppError({
          code: "INVALID_INPUT",
          message: "clientId must be a string",
          statusCode: 400,
        })
      }
      data.clientId = raw.clientId
    }

    if (Object.prototype.hasOwnProperty.call(raw, "requireOtpOnLogin")) {
      data.requireOtpOnLogin = raw.requireOtpOnLogin as boolean
    }

    console.log("✏️ [ADMIN-USER-SERVICE] Updating user:", { userId, keys: Object.keys(data) })

    await this.logger.logSystemEvent("USER_UPDATE", `Admin updating user ${userId} profile`)

    const emailForUniqueness =
      typeof data.email === "string" ? data.email : undefined
    const phoneForUniqueness =
      typeof data.phone === "string" ? data.phone : undefined
    const clientIdForUniqueness =
      typeof data.clientId === "string" ? data.clientId : undefined

    if (emailForUniqueness) {
      const existingEmail = await prisma.user.findFirst({
        where: { email: emailForUniqueness, id: { not: userId } },
      })
      if (existingEmail) {
        throw new Error("Email already exists for another user")
      }
    }

    if (phoneForUniqueness) {
      const existingPhone = await prisma.user.findFirst({
        where: { phone: phoneForUniqueness, id: { not: userId } },
      })
      if (existingPhone) {
        throw new Error("Phone already exists for another user")
      }
    }

    if (clientIdForUniqueness) {
      const existingClientId = await prisma.user.findFirst({
        where: { clientId: clientIdForUniqueness, id: { not: userId } },
      })
      if (existingClientId) {
        throw new Error("Client ID already exists for another user")
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      include: {
        tradingAccount: true,
        kyc: true,
      },
    })

    if (
      priorRequireOtpOnLogin !== undefined &&
      typeof raw.requireOtpOnLogin === "boolean" &&
      priorRequireOtpOnLogin !== raw.requireOtpOnLogin
    ) {
      await this.logger.logSystemEvent(
        "USER_OTP_LOGIN_REQUIREMENT",
        `Admin changed requireOtpOnLogin for user ${userId}`,
        {
          targetUserId: userId,
          previousRequireOtpOnLogin: priorRequireOtpOnLogin,
          newRequireOtpOnLogin: raw.requireOtpOnLogin,
          actorUserId: options?.actorUserId ?? null,
        },
      )
    }

    if (typeof raw.isActive === "boolean" && raw.isActive === false) {
      await invalidateAllLoginSessionsForUser(userId)
    }

    console.log("✅ [ADMIN-USER-SERVICE] User updated successfully")
    return user
  }

  /**
   * Reset user password
   */
  async resetPassword(userId: string, newPassword: string) {
    console.log("🔑 [ADMIN-USER-SERVICE] Resetting password for user:", userId)

    await this.logger.logSystemEvent("PASSWORD_RESET", `Admin resetting password for user ${userId}`)

    const hashedPassword = await bcrypt.hash(newPassword, 10)

    const user = await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
      select: { id: true, email: true, name: true }
    })

    console.log("✅ [ADMIN-USER-SERVICE] Password reset successfully")
    return user
  }

  /**
   * Reset user MPIN
   */
  async resetMPIN(userId: string, newMPIN: string) {
    console.log("🔐 [ADMIN-USER-SERVICE] Resetting MPIN for user:", userId)

    await this.logger.logSystemEvent("MPIN_RESET", `Admin resetting MPIN for user ${userId}`)

    // Encrypt MPIN (simple hash for now, can be enhanced)
    const hashedMPIN = await bcrypt.hash(newMPIN, 10)

    const user = await prisma.user.update({
      where: { id: userId },
      data: { mPin: hashedMPIN },
      select: { id: true, email: true, name: true }
    })

    console.log("✅ [ADMIN-USER-SERVICE] MPIN reset successfully")
    return user
  }

  /**
   * Update trading account funds (Super Admin only)
   * Allows direct manipulation of balance, availableMargin, and usedMargin
   */
  async updateTradingAccountFunds(
    userId: string,
    updates: {
      balance?: number
      availableMargin?: number
      usedMargin?: number
    },
    reason?: string
  ) {
    console.log("💰 [ADMIN-USER-SERVICE] Updating trading account funds:", { userId, updates })

    await this.logger.logSystemEvent("TRADING_ACCOUNT_FUNDS_UPDATE", `Admin updating trading account funds for user ${userId}`, {
      userId,
      updates,
      reason
    })

    // Validate inputs
    if (updates.balance !== undefined && (!Number.isFinite(updates.balance) || updates.balance < 0)) {
      throw new Error("Balance must be a non-negative number")
    }
    if (updates.availableMargin !== undefined && (!Number.isFinite(updates.availableMargin) || updates.availableMargin < 0)) {
      throw new Error("Available margin must be a non-negative number")
    }
    if (updates.usedMargin !== undefined && (!Number.isFinite(updates.usedMargin) || updates.usedMargin < 0)) {
      throw new Error("Used margin must be a non-negative number")
    }

    // Get user's trading account
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { tradingAccount: true }
    })

    if (!user) {
      throw new Error("User not found")
    }

    const ta = user.tradingAccount
    if (!ta) {
      throw new Error("User does not have a trading account")
    }

    const oldBalance = normalizeAdminUserMetricNumber(ta.balance)
    const oldAvailableMargin = normalizeAdminUserMetricNumber(ta.availableMargin)
    const oldUsedMargin = normalizeAdminUserMetricNumber(ta.usedMargin)

    // Calculate deltas for transaction record
    const balanceDelta = updates.balance !== undefined ? updates.balance - oldBalance : 0
    const availableMarginDelta = updates.availableMargin !== undefined ? updates.availableMargin - oldAvailableMargin : 0
    const usedMarginDelta = updates.usedMargin !== undefined ? updates.usedMargin - oldUsedMargin : 0

    // Update trading account and create transaction record
    const result = await prisma.$transaction(async (tx) => {
      // Update trading account
      const updatedAccount = await tx.tradingAccount.update({
        where: { id: ta.id },
        data: {
          ...(updates.balance !== undefined && { balance: updates.balance }),
          ...(updates.availableMargin !== undefined && { availableMargin: updates.availableMargin }),
          ...(updates.usedMargin !== undefined && { usedMargin: updates.usedMargin })
        }
      })

      // Create transaction record for balance changes
      if (balanceDelta !== 0) {
        const balanceDesc = `Admin manual fund adjustment: Balance ${balanceDelta > 0 ? 'increased' : 'decreased'} by ₹${Math.abs(balanceDelta).toLocaleString()}.${reason ? ` Reason: ${reason}.` : ''}`
        await tx.transaction.create({
          data: {
            tradingAccountId: ta.id,
            type: balanceDelta > 0 ? 'CREDIT' : 'DEBIT',
            amount: Math.abs(balanceDelta),
            description: balanceDesc
          }
        })
      }

      // Create transaction record for margin changes
      if (availableMarginDelta !== 0 || usedMarginDelta !== 0) {
        const marginParts: string[] = []
        if (availableMarginDelta !== 0) {
          marginParts.push(`Available margin ${availableMarginDelta > 0 ? '+' : ''}₹${availableMarginDelta.toLocaleString()}`)
        }
        if (usedMarginDelta !== 0) {
          marginParts.push(`Used margin ${usedMarginDelta > 0 ? '+' : ''}₹${usedMarginDelta.toLocaleString()}`)
        }
        const marginDesc = `Admin manual margin adjustment: ${marginParts.join('; ')}.${reason ? ` Reason: ${reason}.` : ''}`
        await tx.transaction.create({
          data: {
            tradingAccountId: ta.id,
            type: (availableMarginDelta - usedMarginDelta) > 0 ? 'CREDIT' : 'DEBIT',
            amount: Math.abs(availableMarginDelta - usedMarginDelta) || Math.abs(availableMarginDelta) || Math.abs(usedMarginDelta),
            description: marginDesc
          }
        })
      }

      return updatedAccount
    })

    console.log("✅ [ADMIN-USER-SERVICE] Trading account funds updated successfully:", {
      oldBalance,
      newBalance: updates.balance ?? oldBalance,
      oldAvailableMargin,
      newAvailableMargin: updates.availableMargin ?? oldAvailableMargin,
      oldUsedMargin,
      newUsedMargin: updates.usedMargin ?? oldUsedMargin
    })

    return result
  }

  /**
   * Approve or reject KYC
   */
  async updateKYCStatus(userId: string, status: KycStatus, reason?: string) {
    console.log("📋 [ADMIN-USER-SERVICE] Updating KYC status:", { userId, status, reason })

    await this.logger.logSystemEvent("KYC_STATUS_UPDATE", `Admin updating KYC status for user ${userId} to ${status}`)

    const kyc = await prisma.kYC.update({
      where: { userId },
      data: {
        status,
        approvedAt: status === 'APPROVED' ? new Date() : null,
        updatedAt: new Date()
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            clientId: true
          }
        }
      }
    })

    console.log("✅ [ADMIN-USER-SERVICE] KYC status updated successfully")
    return kyc
  }

  /**
   * Freeze or unfreeze user account (temporary suspension — does not change isActive / deactivation)
   */
  async freezeAccount(userId: string, freeze: boolean, reason?: string, suspendedById?: string | null) {
    console.log("❄️ [ADMIN-USER-SERVICE] Freezing/unfreezing account:", { userId, freeze, reason })

    await this.logger.logSystemEvent(
      freeze ? "ACCOUNT_FROZEN" : "ACCOUNT_UNFROZEN",
      `Admin ${freeze ? 'froze' : 'unfroze'} account for user ${userId}${reason ? `: ${reason}` : ''}`
    )

    const cappedReason =
      reason != null && reason.length > 512 ? reason.slice(0, 512) : reason ?? null

    const user = await prisma.user.update({
      where: { id: userId },
      data: freeze
        ? {
            suspendedAt: new Date(),
            suspensionReason: cappedReason,
            suspendedById: suspendedById ?? null,
          }
        : {
            suspendedAt: null,
            suspensionReason: null,
            suspendedById: null,
          },
      include: {
        tradingAccount: true
      }
    })

    if (freeze) {
      await invalidateAllLoginSessionsForUser(userId)
    }

    console.log(`✅ [ADMIN-USER-SERVICE] Account ${freeze ? 'frozen' : 'unfrozen'} successfully`)
    return user
  }

  /**
   * Get user activity log (auth events, orders, transactions)
   */
  async getUserActivity(userId: string, limit: number = 100) {
    console.log("📊 [ADMIN-USER-SERVICE] Fetching user activity:", { userId, limit })

    const [authEvents, orders, deposits, withdrawals] = await Promise.all([
      prisma.authEvent.findMany({
        where: { userId },
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.order.findMany({
        where: {
          tradingAccount: { userId }
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          Stock: {
            select: {
              symbol: true,
              name: true
            }
          }
        }
      }),
      prisma.deposit.findMany({
        where: { userId },
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.withdrawal.findMany({
        where: { userId },
        take: limit,
        orderBy: { createdAt: 'desc' }
      })
    ])

    // Combine all activities into unified timeline
    const activities = [
      ...authEvents.map(e => ({
        id: e.id,
        type: 'AUTH',
        action: e.eventType,
        description: e.metadata || e.eventType,
        timestamp: e.createdAt,
        severity: e.severity
      })),
      ...orders.map(o => ({
        id: o.id,
        type: 'ORDER',
        action: `${o.orderSide} ${o.symbol}`,
        description: `Order ${o.status} - Qty: ${o.quantity}, Price: ${o.price}`,
        timestamp: o.createdAt,
        amount: normalizeAdminUserMetricNumber(o.price || 0) * o.quantity
      })),
      ...deposits.map(d => ({
        id: d.id,
        type: 'DEPOSIT',
        action: 'Deposit',
        description: `Deposit ${d.status} - ₹${d.amount}`,
        timestamp: d.createdAt,
        amount: normalizeAdminUserMetricNumber(d.amount)
      })),
      ...withdrawals.map(w => ({
        id: w.id,
        type: 'WITHDRAWAL',
        action: 'Withdrawal',
        description: `Withdrawal ${w.status} - ₹${w.amount}`,
        timestamp: w.createdAt,
        amount: normalizeAdminUserMetricNumber(w.amount)
      }))
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit)

    console.log(`✅ [ADMIN-USER-SERVICE] Found ${activities.length} activities`)
    return activities
  }

  /**
   * Bulk update user statuses
   */
  async bulkUpdateStatus(userIds: string[], isActive: boolean) {
    console.log("📦 [ADMIN-USER-SERVICE] Bulk updating user statuses:", { userIds: userIds.length, isActive })

    await this.logger.logSystemEvent("BULK_USER_UPDATE", `Admin bulk ${isActive ? 'activating' : 'deactivating'} ${userIds.length} users`)

    const result = await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { isActive }
    })

    if (!isActive && userIds.length > 0) {
      await Promise.all(userIds.map((id) => invalidateAllLoginSessionsForUser(id)))
    }

    console.log(`✅ [ADMIN-USER-SERVICE] Bulk updated ${result.count} users`)
    return result
  }

  /**
   * Get users with advanced filters
   */
  async getUsersWithFilters(filters: {
    page?: number
    limit?: number
    search?: string
    status?: 'active' | 'deactivated' | 'suspended' | 'all'
    kycStatus?: KycStatus | 'all'
    role?: Role | 'all'
    dateFrom?: Date
    dateTo?: Date
    contactDuplicate?: boolean
  }): Promise<{ users: UserSummary[]; total: number; pages: number }> {
    console.log("🔍 [ADMIN-USER-SERVICE] Fetching users with filters:", filters)

    const page = filters.page || 1
    const limit = filters.limit || 50
    const skip = (page - 1) * limit
    const contactDuplicate = filters.contactDuplicate ?? false

    const where: any = {}

    // Search filter
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' as const } },
        { email: { contains: filters.search, mode: 'insensitive' as const } },
        { phone: { contains: filters.search, mode: 'insensitive' as const } },
        { clientId: { contains: filters.search, mode: 'insensitive' as const } }
      ]
    }

    // Status filter (deactivated = isActive false and not suspended; suspended = frozen)
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'active') {
        where.isActive = true
        where.suspendedAt = null
      } else if (filters.status === 'deactivated') {
        where.isActive = false
        where.suspendedAt = null
      } else if (filters.status === 'suspended') {
        where.suspendedAt = { not: null }
      }
    }

    // Role filter
    if (filters.role && filters.role !== 'all') {
      where.role = filters.role
    }

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {}
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom
      if (filters.dateTo) where.createdAt.lte = filters.dateTo
    }

    // KYC status filter (via relation)
    if (filters.kycStatus && filters.kycStatus !== 'all') {
      where.kyc = {
        status: filters.kycStatus
      }
    }

    if (contactDuplicate) {
      const overlapIds = await fetchAdminUserIdsWithContactOverlap(prisma, null)
      where.id = { in: overlapIds }
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          tradingAccount: {
            select: {
              id: true,
              balance: true,
              availableMargin: true,
              usedMargin: true,
              _count: {
                select: {
                  orders: true,
                  positions: { where: { quantity: { not: 0 } } }
                }
              }
            }
          },
          kyc: {
            select: {
              id: true,
              status: true,
              panNumber: true,
              aadhaarNumber: true,
              bankProofUrl: true,
            }
          },
          deposits: {
            where: { status: 'COMPLETED' },
            select: {
              amount: true
            }
          },
          withdrawals: {
            where: { status: 'COMPLETED' },
            select: {
              amount: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.user.count({ where })
    ])

    console.log(`✅ [ADMIN-USER-SERVICE] Found ${users.length} users (total: ${total})`)

    const policyCfg = await getActiveUserCountPolicyConfig()
    const withDormant = await attachEligibilityPolicyDormantFlags(users, policyCfg)

    const userSummaries: UserSummary[] = withDormant.map((user) =>
      mapAdminUserListDbRowToSummary(user as unknown as AdminUserListDbRow),
    )

    const withRelated = await this.applyRelatedContactCounts(userSummaries, null)

    return {
      users: withRelated,
      total,
      pages: Math.ceil(total / limit)
    }
  }

  /**
   * Get users managed by a specific Relationship Manager
   */
  async getUsersByRM(
    rmId: string,
    page: number = 1,
    limit: number = 50,
    search?: string,
    options?: { contactDuplicate?: boolean },
  ): Promise<{ users: UserSummary[]; total: number; pages: number }> {
    const contactDuplicate = options?.contactDuplicate ?? false
    console.log("👥 [ADMIN-USER-SERVICE] Fetching users by RM:", { rmId, page, limit, search, contactDuplicate })

    const skip = (page - 1) * limit

    const where: any = {
      managedById: rmId
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
        { phone: { contains: search, mode: 'insensitive' as const } },
        { clientId: { contains: search, mode: 'insensitive' as const } }
      ]
    }

    if (contactDuplicate) {
      const overlapIds = await fetchAdminUserIdsWithContactOverlap(prisma, rmId)
      where.id = { in: overlapIds }
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          tradingAccount: {
            select: {
              id: true,
              balance: true,
              availableMargin: true,
              usedMargin: true,
              _count: {
                select: {
                  orders: true,
                  positions: { where: { quantity: { not: 0 } } }
                }
              }
            }
          },
          kyc: {
            select: {
              id: true,
              status: true,
              panNumber: true,
              aadhaarNumber: true,
              bankProofUrl: true,
            }
          },
          deposits: {
            where: { status: 'COMPLETED' },
            select: {
              amount: true
            }
          },
          withdrawals: {
            where: { status: 'COMPLETED' },
            select: {
              amount: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.user.count({ where })
    ])

    console.log(`✅ [ADMIN-USER-SERVICE] Found ${users.length} users managed by RM ${rmId} (total: ${total})`)

    const policyCfg = await getActiveUserCountPolicyConfig()
    const withDormant = await attachEligibilityPolicyDormantFlags(users, policyCfg)

    const userSummaries: UserSummary[] = withDormant.map((user) =>
      mapAdminUserListDbRowToSummary(user as unknown as AdminUserListDbRow),
    )

    const withRelated = await this.applyRelatedContactCounts(userSummaries, rmId)

    return {
      users: withRelated,
      total,
      pages: Math.ceil(total / limit)
    }
  }

  /**
   * Merged onboarding-relevant timeline from auth events + KYC review logs (no extra CRM tables).
   */
  async getUserOnboardingTimeline(
    userId: string,
    limit: number = 80,
  ): Promise<
    Array<{
      id: string
      source: "auth" | "kyc_review"
      at: string
      title: string
      detail: string | null
    }>
  > {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, kyc: { select: { id: true } } },
    })
    if (!user) {
      throw new Error("User not found")
    }
    const take = Math.min(Math.max(limit, 1), 200)
    const [authEvents, reviewLogs] = await Promise.all([
      prisma.authEvent.findMany({
        where: { userId },
        orderBy: { timestamp: "desc" },
        take,
        select: {
          id: true,
          eventType: true,
          message: true,
          timestamp: true,
        },
      }),
      user.kyc
        ? prisma.kycReviewLog.findMany({
            where: { kycId: user.kyc.id },
            orderBy: { createdAt: "desc" },
            take,
            select: {
              id: true,
              action: true,
              note: true,
              createdAt: true,
              reviewer: { select: { name: true, email: true } },
            },
          })
        : Promise.resolve([]),
    ])

    const merged: Array<{
      id: string
      source: "auth" | "kyc_review"
      at: string
      title: string
      detail: string | null
    }> = [
      ...authEvents.map((e) => ({
        id: `auth-${e.id}`,
        source: "auth" as const,
        at: e.timestamp.toISOString(),
        title: String(e.eventType),
        detail: e.message,
      })),
      ...reviewLogs.map((r) => ({
        id: `kyc-${r.id}`,
        source: "kyc_review" as const,
        at: r.createdAt.toISOString(),
        title: `KYC ${r.action}`,
        detail: r.note || (r.reviewer?.name ? `Reviewer: ${r.reviewer.name}` : null),
      })),
    ]
    merged.sort((a, b) => (a.at < b.at ? 1 : -1))
    return merged.slice(0, take)
  }

  /**
   * Verify user email or phone manually
   */
  async verifyContact(userId: string, type: 'email' | 'phone') {
    console.log("✅ [ADMIN-USER-SERVICE] Verifying contact:", { userId, type })

    await this.logger.logSystemEvent("CONTACT_VERIFIED", `Admin verified ${type} for user ${userId}`)

    const updateData: any = {}
    if (type === 'email') {
      updateData.emailVerified = new Date()
    } else {
      updateData.phoneVerified = new Date()
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData
    })

    console.log(`✅ [ADMIN-USER-SERVICE] ${type} verified successfully`)
    return user
  }

  /**
   * Get top traders by profit and win rate
   */
  async getTopTraders(limit: number = 10) {
    console.log("🏆 [ADMIN-USER-SERVICE] Fetching top traders:", { limit })

    // Get users with their trading accounts and positions
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        tradingAccount: {
          isNot: null
        }
      },
      include: {
        tradingAccount: {
          include: {
            positions: {
              where: {
                quantity: { not: 0 }
              }
            },
            orders: {
              where: {
                status: 'EXECUTED'
              }
            },
            trades: {
              where: {
                type: 'CREDIT'
              }
            }
          }
        }
      },
      take: limit * 2 // Get more to calculate win rate
    })

    // Calculate metrics for each user
    const traders = users
      .map(user => {
        if (!user.tradingAccount) return null

        const positions = user.tradingAccount.positions || []
        const orders = user.tradingAccount.orders || []
        const trades = user.tradingAccount.trades || []

        // Calculate total profit from positions (unrealized PnL)
        const totalProfit = positions.reduce((sum, pos) => {
          return sum + normalizeAdminUserMetricNumber(pos.unrealizedPnL || 0)
        }, 0)

        // Calculate win rate from executed orders
        const totalTrades = orders.length
        const winningTrades = orders.filter(order => {
          // Find corresponding position to check if profitable
          const position = positions.find(p => p.symbol === order.symbol)
          if (!position) return false
          return normalizeAdminUserMetricNumber(position.unrealizedPnL || 0) > 0
        }).length

        const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0

        return {
          id: user.id,
          name: user.name || 'Unknown',
          clientId: user.clientId || user.id.slice(0, 10),
          profit: totalProfit,
          trades: totalTrades,
          winRate: Math.round(winRate)
        }
      })
      .filter((t): t is NonNullable<typeof t> => t !== null && t.trades > 0) // Only traders with actual trades
      .sort((a, b) => b.profit - a.profit) // Sort by profit descending
      .slice(0, limit) // Take top N

    console.log(`✅ [ADMIN-USER-SERVICE] Found ${traders.length} top traders`)
    return traders
  }

  /**
   * Get system alerts from risk alerts and system health
   */
  async getSystemAlerts(limit: number = 10) {
    console.log("🚨 [ADMIN-USER-SERVICE] Fetching system alerts:", { limit })

    const [riskAlerts, recentErrors] = await Promise.all([
      // Get unresolved risk alerts
      prisma.riskAlert.findMany({
        where: {
          resolved: false
        },
        include: {
          user: {
            select: {
              name: true,
              clientId: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limit
      }),
      // Get recent critical system errors from logs
      prisma.tradingLog.findMany({
        where: {
          level: 'ERROR',
          category: 'SYSTEM'
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limit / 2
      })
    ])

    // Format risk alerts
    const alerts = [
      ...riskAlerts.map(alert => ({
        id: alert.id,
        type: alert.severity === 'CRITICAL' ? 'error' : 'warning',
        message: `${alert.type}: ${alert.message}`,
        time: alert.createdAt,
        user: alert.user?.name || alert.user?.clientId || 'Unknown'
      })),
      ...recentErrors.map(log => ({
        id: log.id,
        type: 'error',
        message: log.message,
        time: log.createdAt,
        user: 'System'
      }))
    ]
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, limit)
      .map(alert => ({
        ...alert,
        time: this.getTimeAgo(alert.time)
      }))

    console.log(`✅ [ADMIN-USER-SERVICE] Found ${alerts.length} system alerts`)
    return alerts
  }

  /**
   * Get trading chart data (volume and price over time)
   */
  async getTradingChartData(days: number = 7) {
    console.log("📈 [ADMIN-USER-SERVICE] Fetching trading chart data:", { days })

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    // Get orders grouped by day
    const orders = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: startDate
        },
        status: 'EXECUTED'
      },
      select: {
        createdAt: true,
        quantity: true,
        averagePrice: true,
        price: true
      }
    })

    // Group by day and calculate metrics
    const dailyData: { [key: string]: { volume: number; prices: number[] } } = {}

    orders.forEach(order => {
      const dateKey = order.createdAt.toISOString().split('T')[0]
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { volume: 0, prices: [] }
      }
      dailyData[dateKey].volume += order.quantity
      const price = normalizeAdminUserMetricNumber(order.averagePrice || order.price || 0)
      if (price > 0) {
        dailyData[dateKey].prices.push(price)
      }
    })

    // Convert to chart format
    const chartData = Object.entries(dailyData)
      .map(([date, data]) => {
        const avgPrice = data.prices.length > 0
          ? data.prices.reduce((sum, p) => sum + p, 0) / data.prices.length
          : 0

        return {
          time: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          date: date,
          price: Math.round(avgPrice),
          volume: data.volume
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date))

    // Fill in missing days with zero values
    const filledData = []
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate)
      date.setDate(date.getDate() + i)
      const dateKey = date.toISOString().split('T')[0]
      const existing = chartData.find(d => d.date === dateKey)
      filledData.push(existing || {
        time: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        date: dateKey,
        price: 0,
        volume: 0
      })
    }

    console.log(`✅ [ADMIN-USER-SERVICE] Generated chart data for ${filledData.length} days`)
    return filledData
  }

  /**
   * Get user activity chart data (daily active and new users)
   */
  async getUserActivityChartData(days: number = 7) {
    console.log("👥 [ADMIN-USER-SERVICE] Fetching user activity chart data:", { days })

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    // Get all users created in the period
    const allUsers = await prisma.user.findMany({
      where: {
        createdAt: {
          gte: startDate
        }
      },
      select: {
        createdAt: true,
        id: true
      }
    })

    // Get active users (users who logged in or placed orders)
    // Use a simpler approach: get users with orders or recent sessions
    const [orders, sessions] = await Promise.all([
      prisma.order.findMany({
        where: {
          createdAt: { gte: startDate }
        },
        select: {
          tradingAccount: {
            select: {
              userId: true
            }
          },
          createdAt: true
        }
      }),
      prisma.sessionAuth.findMany({
        where: {
          lastActivity: { gte: startDate }
        },
        select: {
          userId: true,
          lastActivity: true
        }
      })
    ])

    // Group by user and date to get unique user-date combinations
    const userDateMap = new Map<string, Date>()
    
    orders.forEach(o => {
      const userId = o.tradingAccount.userId
      const dateKey = o.createdAt.toISOString().split('T')[0]
      const key = `${userId}-${dateKey}`
      if (!userDateMap.has(key) || userDateMap.get(key)! < o.createdAt) {
        userDateMap.set(key, o.createdAt)
      }
    })

    sessions.forEach(s => {
      const dateKey = s.lastActivity.toISOString().split('T')[0]
      const key = `${s.userId}-${dateKey}`
      if (!userDateMap.has(key) || userDateMap.get(key)! < s.lastActivity) {
        userDateMap.set(key, s.lastActivity)
      }
    })

    // Convert to array format
    const activeUserIds = Array.from(userDateMap.entries()).map(([key, date]) => {
      const [userId] = key.split('-')
      return { userId, date }
    })

    // Group by day
    const dailyData: { [key: string]: { active: Set<string>; new: Set<string> } } = {}

    // Process new users
    allUsers.forEach(user => {
      const dateKey = user.createdAt.toISOString().split('T')[0]
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { active: new Set(), new: new Set() }
      }
      dailyData[dateKey].new.add(user.id)
    })

    // Process active users
    activeUserIds.forEach(item => {
      const dateKey = item.date.toISOString().split('T')[0]
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { active: new Set(), new: new Set() }
      }
      dailyData[dateKey].active.add(item.userId)
    })

    // Convert to chart format
    const chartData = []
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate)
      date.setDate(date.getDate() + i)
      const dateKey = date.toISOString().split('T')[0]
      const data = dailyData[dateKey] || { active: new Set(), new: new Set() }

      chartData.push({
        day: dayNames[date.getDay()],
        date: dateKey,
        active: data.active.size,
        new: data.new.size
      })
    }

    console.log(`✅ [ADMIN-USER-SERVICE] Generated activity data for ${chartData.length} days`)
    return chartData
  }

  /**
   * Helper to format time ago
   */
  private getTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
    if (seconds < 60) return `${seconds} sec ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} min ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
    const days = Math.floor(hours / 24)
    return `${days} day${days > 1 ? 's' : ''} ago`
  }
}

/**
 * Create admin user service instance
 */
export function createAdminUserService(logger?: TradingLogger): AdminUserService {
  console.log("🏭 [ADMIN-USER-SERVICE] Creating service instance")
  return new AdminUserService(logger)
}

console.log("✅ [ADMIN-USER-SERVICE] Module initialized")