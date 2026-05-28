import { prisma } from '@/lib/prisma'
import { DepositStatus, WithdrawalStatus } from '@prisma/client'
import { parseFiniteMarketNumber } from '@/lib/market-data/utils/quote-lookup'

export type TimeGranularity = 'day' | 'week' | 'month'

export interface FinanceSummary {
  totalDeposits: number
  totalWithdrawals: number
  netFlow: number
  pendingDeposits: number
  pendingWithdrawals: number
  commissionDue: number
}

export interface CommissionRules {
  depositCommissionRate: number // 0..1
  withdrawalCommissionRate: number // 0..1
  includeWithdrawalCharges: boolean
  methodOverrides?: Record<string, { depositRate?: number; withdrawalRate?: number; min?: number; max?: number }>
  caps?: { perTxnMin?: number; perTxnMax?: number }
}

function normalizeSuperAdminFinanceAmount(value: unknown): number {
  return parseFiniteMarketNumber(value) ?? 0
}

export class SuperAdminFinanceService {
  static async getSummary(from?: Date, to?: Date): Promise<FinanceSummary> {
    const where = (createdAt: any = {}) => ({ createdAt, })
    const range: any = {}
    if (from) range.gte = from
    if (to) range.lte = to

    const [depositsAgg, withdrawalsAgg, pendingDeposits, pendingWithdrawals] = await Promise.all([
      prisma.deposit.aggregate({
        _sum: { amount: true },
        where: { status: DepositStatus.COMPLETED, ...(from || to ? where({ ...range }) : {}) }
      }),
      prisma.withdrawal.aggregate({
        _sum: { amount: true },
        where: { status: WithdrawalStatus.COMPLETED, ...(from || to ? where({ ...range }) : {}) }
      }),
      prisma.deposit.count({ where: { status: { in: [DepositStatus.PENDING, DepositStatus.PROCESSING] } } }),
      prisma.withdrawal.count({ where: { status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING] } } }),
    ])

    const totalDeposits = normalizeSuperAdminFinanceAmount(depositsAgg._sum.amount)
    const totalWithdrawals = normalizeSuperAdminFinanceAmount(withdrawalsAgg._sum.amount)

    const rules = await this.getCommissionRules()
    const commissionDue = await this.computeCommission(totalDeposits, totalWithdrawals, rules, from, to)

    return {
      totalDeposits,
      totalWithdrawals,
      netFlow: totalDeposits - totalWithdrawals,
      pendingDeposits,
      pendingWithdrawals,
      commissionDue,
    }
  }

  static async getTimeSeries(granularity: TimeGranularity, from: Date, to: Date) {
    // Use Prisma groupBy by day/week/month via raw SQL for performance
    const dateTrunc = granularity === 'day' ? 'day' : granularity === 'week' ? 'week' : 'month'
    const deposits = await prisma.$queryRawUnsafe<any[]>(
      `SELECT date_trunc($1, d."createdAt") AS bucket, SUM(d.amount)::decimal AS total
       FROM deposits d
       WHERE d.status = 'COMPLETED' AND d."createdAt" BETWEEN $2 AND $3
       GROUP BY 1 ORDER BY 1`,
      dateTrunc, from, to
    )
    const withdrawals = await prisma.$queryRawUnsafe<any[]>(
      `SELECT date_trunc($1, w."createdAt") AS bucket, SUM(w.amount)::decimal AS total
       FROM withdrawals w
       WHERE w.status = 'COMPLETED' AND w."createdAt" BETWEEN $2 AND $3
       GROUP BY 1 ORDER BY 1`,
      dateTrunc, from, to
    )
    return { deposits, withdrawals }
  }

  static async getBreakdown(by: 'status' | 'method' | 'bank' | 'user', from?: Date, to?: Date) {
    const range: any = {}
    if (from) range.gte = from
    if (to) range.lte = to

    if (by === 'status') {
      const [d, w] = await Promise.all([
        prisma.deposit.groupBy({ by: ['status'], _sum: { amount: true }, where: from || to ? { createdAt: { ...range } } : {} }),
        prisma.withdrawal.groupBy({ by: ['status'], _sum: { amount: true }, where: from || to ? { createdAt: { ...range } } : {} }),
      ])
      return { deposits: d, withdrawals: w }
    }
    if (by === 'method') {
      const d = await prisma.deposit.groupBy({ by: ['method'], _sum: { amount: true }, where: from || to ? { createdAt: { ...range } } : {} })
      return { deposits: d }
    }
    if (by === 'bank') {
      const [d, w] = await Promise.all([
        prisma.deposit.groupBy({ by: ['bankAccountId'], _sum: { amount: true }, where: from || to ? { createdAt: { ...range } } : {} }),
        prisma.withdrawal.groupBy({ by: ['bankAccountId'], _sum: { amount: true }, where: from || to ? { createdAt: { ...range } } : {} }),
      ])
      return { deposits: d, withdrawals: w }
    }
    // user
    const [d, w] = await Promise.all([
      prisma.deposit.groupBy({ by: ['userId'], _sum: { amount: true }, where: from || to ? { createdAt: { ...range } } : {} }),
      prisma.withdrawal.groupBy({ by: ['userId'], _sum: { amount: true }, where: from || to ? { createdAt: { ...range } } : {} }),
    ])
    return { deposits: d, withdrawals: w }
  }

  static async getTopUsers(by: 'deposits' | 'withdrawals', limit = 10, from?: Date, to?: Date) {
    const range: any = {}
    if (from) range.gte = from
    if (to) range.lte = to
    const isDep = by === 'deposits'
    const table = (isDep ? prisma.deposit : prisma.withdrawal) as typeof prisma.deposit
    const statusFilter = isDep ? { status: DepositStatus.COMPLETED } : { status: WithdrawalStatus.COMPLETED }
    const rows = await table.groupBy({
      by: ['userId'],
      _sum: { amount: true },
      where: { ...(from || to ? { createdAt: { ...range } } : {}), ...statusFilter },
      orderBy: { _sum: { amount: 'desc' } },
      take: limit,
    })
    return rows
  }

  static async listTransactions(
    type: 'DEPOSIT' | 'WITHDRAWAL',
    { status, method, userId, bankAccountId, from, to, page = 1, pageSize = 20 }:
      { status?: string; method?: string; userId?: string; bankAccountId?: string; from?: Date; to?: Date; page?: number; pageSize?: number }
  ) {
    const createdAt: any = {}
    if (from) createdAt.gte = from
    if (to) createdAt.lte = to
    const where: any = { ...(from || to ? { createdAt } : {}) }
    if (status) where.status = status as any
    if (method && type === 'DEPOSIT') where.method = method
    if (userId) where.userId = userId
    if (bankAccountId) where.bankAccountId = bankAccountId

    const skip = (page - 1) * pageSize
    if (type === 'DEPOSIT') {
      const [rows, total] = await Promise.all([
        prisma.deposit.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize, include: { bankAccount: true, user: true } }),
        prisma.deposit.count({ where })
      ])
      return { rows, total, page, pageSize }
    }
    const [rows, total] = await Promise.all([
      prisma.withdrawal.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize, include: { bankAccount: true, user: true } }),
      prisma.withdrawal.count({ where })
    ])
    return { rows, total, page, pageSize }
  }

  static async getCommissionRules(): Promise<CommissionRules> {
    const entry = await prisma.systemSettings.findFirst({
      // `key` is not globally unique. Global settings are stored under ownerId = null.
      where: { key: 'finance_commission_rules', ownerId: null, isActive: true },
    })
    if (!entry) {
      return { depositCommissionRate: 0.005, withdrawalCommissionRate: 0.002, includeWithdrawalCharges: true }
    }
    try {
      return JSON.parse(entry.value)
    } catch {
      return { depositCommissionRate: 0.005, withdrawalCommissionRate: 0.002, includeWithdrawalCharges: true }
    }
  }

  static async updateCommissionRules(rules: CommissionRules) {
    const value = JSON.stringify(rules)
    await prisma.$transaction(async (tx) => {
      const existing = await tx.systemSettings.findFirst({
        where: { key: "finance_commission_rules", ownerId: null },
        orderBy: { updatedAt: "desc" },
      })

      if (existing) {
        await tx.systemSettings.update({
          where: { id: existing.id },
          data: { value, isActive: true, updatedAt: new Date() },
        })

        await tx.systemSettings.updateMany({
          where: { key: "finance_commission_rules", ownerId: null, id: { not: existing.id } },
          data: { isActive: false, updatedAt: new Date() },
        })

        return
      }

      await tx.systemSettings.create({
        data: { key: "finance_commission_rules", value, category: "FINANCE", isActive: true },
      })
    })
    return { success: true }
  }

  static async computeCommission(totalDeposits: number, totalWithdrawals: number, rules: CommissionRules, from?: Date, to?: Date) {
    // Base commission
    let commission = totalDeposits * (rules.depositCommissionRate || 0) + totalWithdrawals * (rules.withdrawalCommissionRate || 0)
    if (rules.includeWithdrawalCharges) {
      const range: any = {}
      if (from) range.gte = from
      if (to) range.lte = to
      const agg = await prisma.withdrawal.aggregate({ _sum: { charges: true }, where: from || to ? { createdAt: { ...range }, status: WithdrawalStatus.COMPLETED } as any : { status: WithdrawalStatus.COMPLETED } as any })
      commission += normalizeSuperAdminFinanceAmount(agg._sum.charges)
    }
    // Apply caps if any
    if (rules.caps?.perTxnMin || rules.caps?.perTxnMax) {
      // Skipping per-transaction caps in aggregate; enforce in detailed ledger export calculations
    }
    return commission
  }
}
