/**
 * File:        scripts/check-market-status.ts
 * Module:      scripts · Market Diagnostics
 * Purpose:     Diagnose and (optionally) fix the live market-status state on a deployed
 *              instance. Reports server clock, IST wall-clock, NSE/MCX session window
 *              decisions, and the current `market_force_closed` row in the connected DB.
 *              Use --open / --close / --delete-row to mutate state without DB credentials
 *              in hand — the script uses whatever DATABASE_URL the app process has.
 *
 * Exports:    (none — script entry point)
 *
 * Depends on:
 *   - @prisma/client — same DATABASE_URL resolution as the running app
 *
 * Side-effects:
 *   - Reads system_settings rows (always)
 *   - Writes system_settings.market_force_closed when --open / --close passed
 *   - Deletes all market_force_closed rows when --delete-row passed (forces default = false)
 *
 * Usage:
 *   # 1. Read-only diagnostic (recommended first step)
 *   npx tsx scripts/check-market-status.ts
 *
 *   # 2. Force market open (sets force_closed = "false")
 *   npx tsx scripts/check-market-status.ts --open
 *
 *   # 3. Force market closed (sets force_closed = "true")
 *   npx tsx scripts/check-market-status.ts --close
 *
 *   # 4. Nuke the row entirely (server falls back to default = false)
 *   npx tsx scripts/check-market-status.ts --delete-row
 *
 * Key invariants:
 *   - Mirrors getMarketForceClosedFromDB() exactly: { key: 'market_force_closed', isActive: true }
 *   - Mirrors NSE window 09:15–15:30 IST and MCX window 09:00–23:55 IST from server-side
 *     market-timing.ts so the script's verdict matches what /api/market/status returns
 *   - Server-side cache TTL is 5s — wait 5s after a write before re-curling /api/market/status
 *
 * Read order:
 *   1. main()                      — orchestration
 *   2. printClockReport()          — time/clock skew detection
 *   3. printDbReport()             — DB row inspection
 *   4. printVerdict()              — what the server WOULD return right now
 *   5. applyMutation()             — --open / --close / --delete-row handlers
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const FORCE_CLOSED_KEY = "market_force_closed"
const HOLIDAYS_KEY = "market_holidays_csv"
const CACHE_TTL_HINT_SEC = 5

type Mode = "report" | "open" | "close" | "delete-row"

function parseMode(argv: string[]): Mode {
  if (argv.includes("--open")) return "open"
  if (argv.includes("--close")) return "close"
  if (argv.includes("--delete-row")) return "delete-row"
  return "report"
}

/** Real wall-clock IST (timezone-independent). */
function nowIST(): Date {
  const now = new Date()
  const utcMillis = now.getTime() + now.getTimezoneOffset() * 60000
  return new Date(utcMillis + 5.5 * 60 * 60000)
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function formatHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function printSection(title: string): void {
  console.log("")
  console.log(`──────── ${title} ────────`)
}

function printClockReport(): { ist: Date; minutesSinceMidnightIst: number; isWeekend: boolean } {
  printSection("CLOCK & TIMEZONE")

  const realNow = new Date()
  const ist = nowIST()
  const dayIst = ist.getDay()
  const minutesIst = ist.getHours() * 60 + ist.getMinutes()
  const isWeekend = dayIst === 0 || dayIst === 6

  console.log(`Server real time (UTC ISO):     ${realNow.toISOString()}`)
  console.log(`Server real time (toString):    ${realNow.toString()}`)
  console.log(`Computed IST wall-clock:        ${ist.toISOString().replace("Z", "")} (IST)`)
  console.log(`IST day-of-week:                ${dayIst} (${DAY_NAMES[dayIst]})`)
  console.log(`IST minutes since midnight:     ${minutesIst} (${formatHHMM(minutesIst)})`)
  console.log(`process.env.TZ:                 ${process.env.TZ ?? "(unset)"}`)
  console.log(`Date.getTimezoneOffset() (min): ${realNow.getTimezoneOffset()}`)

  // Compare against what the user "thinks" is now. If skew > 5 min from a sane reference,
  // the server clock is suspect — flag it loudly.
  const skewWarningMinutes = 5
  const expectedYearMin = 2024
  const expectedYearMax = 2099
  const istYear = ist.getFullYear()
  if (istYear < expectedYearMin || istYear > expectedYearMax) {
    console.log("")
    console.log(`⚠️  WARNING: Server year is ${istYear} — likely wrong system clock.`)
    console.log(`   Run: sudo timedatectl set-ntp true && sudo systemctl restart chronyd`)
  }
  void skewWarningMinutes // reserved for future external-source skew check

  if (isWeekend) {
    console.log("")
    console.log(`⚠️  Server thinks today is ${DAY_NAMES[dayIst]} — markets are CLOSED on weekends.`)
    console.log(`   If real today is a weekday, the EC2 system clock is wrong. Fix it before debugging anything else.`)
  }

  return { ist, minutesSinceMidnightIst: minutesIst, isWeekend }
}

async function printDbReport(): Promise<{ forceClosed: boolean; rowCount: number; activeRowCount: number }> {
  printSection("DATABASE: market_force_closed")

  const dbUrl = process.env.DATABASE_URL ?? ""
  const maskedHost = dbUrl.replace(/:\/\/[^@]+@/, "://***@").slice(0, 120)
  console.log(`DATABASE_URL (masked):          ${maskedHost || "(unset)"}`)

  const allRows = await prisma.systemSettings.findMany({
    where: { key: FORCE_CLOSED_KEY },
    orderBy: { updatedAt: "desc" },
  })
  const activeRows = allRows.filter((r) => r.isActive)

  console.log(`Total rows for key:             ${allRows.length}`)
  console.log(`Active rows for key:            ${activeRows.length}`)

  if (allRows.length === 0) {
    console.log("(no row exists — server falls back to default false)")
    return { forceClosed: false, rowCount: 0, activeRowCount: 0 }
  }

  for (const row of allRows) {
    const flag = row.isActive ? "ACTIVE" : "inactive"
    console.log(`  [${flag}] id=${row.id}`)
    console.log(`           value="${row.value}"  ownerId=${row.ownerId ?? "null"}`)
    console.log(`           updatedAt=${row.updatedAt.toISOString()}`)
  }

  if (activeRows.length > 1) {
    console.log("")
    console.log(`⚠️  Multiple ACTIVE rows for ${FORCE_CLOSED_KEY}. The server's findFirst({ isActive: true })`)
    console.log(`   has no orderBy, so the result is non-deterministic. The admin POST handler is supposed to`)
    console.log(`   soft-disable duplicates, but evidently didn't here. Run with --delete-row to clean up,`)
    console.log(`   then toggle once from the admin UI to recreate exactly one row.`)
  }

  // Mirror getMarketForceClosedFromDB(): findFirst with no orderBy
  const setting = await prisma.systemSettings.findFirst({
    where: { key: FORCE_CLOSED_KEY, isActive: true },
  })
  const forceClosed = setting?.value === "true"
  console.log(`\nServer would compute forceClosed = ${forceClosed} (mirroring getMarketForceClosedFromDB)`)

  return { forceClosed, rowCount: allRows.length, activeRowCount: activeRows.length }
}

async function printHolidaysReport(istDateKey: string): Promise<void> {
  printSection("DATABASE: market_holidays_csv")
  const row = await prisma.systemSettings.findFirst({
    where: { key: HOLIDAYS_KEY, isActive: true },
  })
  if (!row) {
    console.log("(no holidays row — empty holiday set)")
    return
  }
  const raw = row.value
  const parsed = raw
    .split(/[,\n\r]+/)
    .map((s: string) => s.trim())
    .filter(Boolean)
    .filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  console.log(`Raw value:     "${raw}"`)
  console.log(`Parsed (valid YYYY-MM-DD only): [${parsed.join(", ")}]`)
  if (parsed.length === 0 && raw.length > 0) {
    console.log(`⚠️  Raw value is non-empty but parses to nothing. Format must be YYYY-MM-DD (e.g., 2026-01-26),`)
    console.log(`   not YYYY/MM/DD. Slash-formatted dates are silently dropped today.`)
  }
  if (parsed.includes(istDateKey)) {
    console.log(`⚠️  Today (${istDateKey}) IS in the holiday list — markets will be reported closed for that reason.`)
  }
}

function printVerdict(args: {
  forceClosed: boolean
  isWeekend: boolean
  minutesSinceMidnightIst: number
}): void {
  printSection("VERDICT — what /api/market/status WILL return right now")

  const NSE_OPEN = 9 * 60 + 15
  const NSE_CLOSE = 15 * 60 + 30
  const PRE_OPEN_START = 9 * 60
  const MCX_OPEN = 9 * 60
  const MCX_CLOSE = 23 * 60 + 55

  let session: "open" | "pre-open" | "closed"
  let reason: string

  if (args.forceClosed) {
    session = "closed"
    reason = "Market is force-closed by operations (DB row says true)"
  } else if (args.isWeekend) {
    session = "closed"
    reason = "Weekend (per server's day-of-week — verify clock if today is a weekday)"
  } else if (
    args.minutesSinceMidnightIst >= PRE_OPEN_START &&
    args.minutesSinceMidnightIst < NSE_OPEN
  ) {
    session = "pre-open"
    reason = "NSE pre-open window 09:00–09:15 IST"
  } else if (
    args.minutesSinceMidnightIst >= NSE_OPEN &&
    args.minutesSinceMidnightIst <= NSE_CLOSE
  ) {
    session = "open"
    reason = "Inside NSE trading window 09:15–15:30 IST"
  } else {
    session = "closed"
    reason = "Outside NSE trading hours 09:15–15:30 IST"
  }

  const mcxOpen =
    !args.forceClosed &&
    !args.isWeekend &&
    args.minutesSinceMidnightIst >= MCX_OPEN &&
    args.minutesSinceMidnightIst <= MCX_CLOSE

  console.log(`NSE session:      ${session}  (${reason})`)
  console.log(`MCX session:      ${mcxOpen ? "open" : "closed"}  (window 09:00–23:55 IST)`)
  console.log(`forceClosed flag: ${args.forceClosed}`)
}

async function applyMutation(mode: Mode): Promise<void> {
  if (mode === "report") return

  printSection(`MUTATION: ${mode}`)

  if (mode === "delete-row") {
    const result = await prisma.systemSettings.deleteMany({
      where: { key: FORCE_CLOSED_KEY },
    })
    console.log(`Deleted ${result.count} row(s) for ${FORCE_CLOSED_KEY}.`)
    console.log(`Server will now fall back to default forceClosed = false.`)
    return
  }

  const targetValue = mode === "open" ? "false" : "true"
  const action = mode === "open" ? "Force-open" : "Force-close"

  // Mirror admin POST upsert logic exactly so we don't fight the app's own writes.
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.systemSettings.findFirst({
      where: { key: FORCE_CLOSED_KEY, ownerId: null },
      orderBy: { updatedAt: "desc" },
    })

    if (existing) {
      const updated = await tx.systemSettings.update({
        where: { id: existing.id },
        data: {
          value: targetValue,
          category: "MARKET",
          isActive: true,
          updatedAt: new Date(),
        },
      })
      // Soft-disable duplicates — same as admin POST handler.
      await tx.systemSettings.updateMany({
        where: { key: FORCE_CLOSED_KEY, ownerId: null, id: { not: existing.id } },
        data: { isActive: false, updatedAt: new Date() },
      })
      return { mode: "updated" as const, row: updated }
    }

    const created = await tx.systemSettings.create({
      data: {
        key: FORCE_CLOSED_KEY,
        value: targetValue,
        category: "MARKET",
        isActive: true,
      },
    })
    return { mode: "created" as const, row: created }
  })

  console.log(`${action}: ${result.mode} row id=${result.row.id} value="${result.row.value}"`)
  console.log("")
  console.log(`⏱  Wait ~${CACHE_TTL_HINT_SEC} seconds, then re-run this script (no flags) to confirm,`)
  console.log(`   or hit /api/market/status to see the live API response.`)
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2))

  console.log("======== MARKET STATUS DIAGNOSTIC ========")
  console.log(`Mode: ${mode}`)

  const clock = printClockReport()
  const db = await printDbReport()

  // YYYY-MM-DD key for the IST date (matches getISTDateKey on the server)
  const y = clock.ist.getFullYear()
  const m = String(clock.ist.getMonth() + 1).padStart(2, "0")
  const d = String(clock.ist.getDate()).padStart(2, "0")
  const istDateKey = `${y}-${m}-${d}`
  await printHolidaysReport(istDateKey)

  printVerdict({
    forceClosed: db.forceClosed,
    isWeekend: clock.isWeekend,
    minutesSinceMidnightIst: clock.minutesSinceMidnightIst,
  })

  await applyMutation(mode)

  console.log("")
  console.log("======== END ========")
}

main()
  .catch((err) => {
    console.error("\n❌ Diagnostic failed:")
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
