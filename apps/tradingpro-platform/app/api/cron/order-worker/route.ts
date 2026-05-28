/**
 * @file route.ts
 * @module cron
 * @description Cron endpoint to execute pending orders asynchronously via `OrderExecutionWorker`.
 * Can be called by EC2 cron, external cron services, or AWS Lambda/EventBridge (Amplify-friendly).
 * Protected by CRON_SECRET environment variable.
 * @author StockTrade
 * @created 2026-02-03
 */

export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { orderExecutionWorker } from "@/lib/services/order/OrderExecutionWorker"
import { parseFiniteCronQueryNumber } from "@/lib/server/cron-number-utils"
import { runScheduledCleanupTick } from "@/lib/server/workers/cleanup-auto-runner"

function normalizeLimit(value: string | null): number {
  const parsedValue = parseFiniteCronQueryNumber(value)
  if (parsedValue === null) {
    return 25
  }
  return Math.min(200, Math.max(1, Math.trunc(parsedValue)))
}

function normalizeMaxAgeMs(value: string | null): number {
  const parsedValue = parseFiniteCronQueryNumber(value)
  if (parsedValue === null) {
    return 0
  }
  return Math.max(0, Math.trunc(parsedValue))
}

function serializeUrlCandidate(candidate: unknown): string | null {
  if (candidate === null || candidate === undefined) {
    return null
  }
  try {
    const serializedCandidate = String(candidate).trim()
    if (
      serializedCandidate.length === 0 ||
      serializedCandidate === "[object Object]" ||
      serializedCandidate === "[object Undefined]" ||
      serializedCandidate === "[object Null]"
    ) {
      return null
    }
    return serializedCandidate
  } catch {
    return null
  }
}

function normalizePathnameCandidate(candidate: unknown): string | null {
  const serializedCandidate = serializeUrlCandidate(candidate)
  if (!serializedCandidate) {
    return null
  }
  if (serializedCandidate.startsWith("http://") || serializedCandidate.startsWith("https://")) {
    try {
      return new URL(serializedCandidate).pathname || null
    } catch {
      return null
    }
  }
  if (serializedCandidate.startsWith("/")) {
    return serializedCandidate
  }
  return `/${serializedCandidate}`
}

function normalizeSearchCandidate(candidate: unknown): string {
  if (candidate === null || candidate === undefined) {
    return ""
  }
  if (candidate instanceof URLSearchParams) {
    const serializedParams = candidate.toString().trim()
    return serializedParams.length > 0 ? `?${serializedParams}` : ""
  }
  const serializedCandidate = serializeUrlCandidate(candidate)
  if (!serializedCandidate) {
    return ""
  }
  if (serializedCandidate.startsWith("?")) {
    return serializedCandidate
  }
  return `?${serializedCandidate}`
}

function resolveSearchCarrier(rawUrl: { search?: unknown; searchParams?: unknown }): unknown {
  const directSearch = resolveCallableValue(rawUrl.search)
  if (directSearch !== undefined && directSearch !== null) {
    return directSearch
  }
  return resolveCallableValue(rawUrl.searchParams)
}

function resolveRequestField(req: Request, fieldName: "url" | "nextUrl"): unknown {
  try {
    return resolveCallableValue((req as Record<string, unknown>)[fieldName])
  } catch {
    return undefined
  }
}

function resolveCallableValue<T>(value: T | (() => T)): T | undefined {
  try {
    return typeof value === "function" ? (value as () => T)() : value
  } catch {
    return undefined
  }
}

function resolveRequestUrlFromCandidate(rawUrl: unknown): string | null {
  if (typeof rawUrl === "string") {
    const trimmedUrl = rawUrl.trim()
    return trimmedUrl.length > 0 ? trimmedUrl : null
  }
  if (!rawUrl || (typeof rawUrl !== "object" && typeof rawUrl !== "function")) {
    return null
  }

  const hrefCandidate = resolveCallableValue((rawUrl as { href?: unknown }).href)
  const serializedHrefCandidate = serializeUrlCandidate(hrefCandidate)
  if (serializedHrefCandidate) {
    return serializedHrefCandidate
  }

  const pathnameCandidate = resolveCallableValue((rawUrl as { pathname?: unknown }).pathname)
  const normalizedPathname = normalizePathnameCandidate(pathnameCandidate)
  const searchCarrier = resolveSearchCarrier(rawUrl as { search?: unknown; searchParams?: unknown })
  const normalizedSearch = normalizeSearchCandidate(searchCarrier)
  if (normalizedPathname) {
    return `http://localhost${normalizedPathname}${normalizedSearch}`
  }

  if (normalizedSearch) {
    return `http://localhost/${normalizedSearch}`
  }

  return serializeUrlCandidate(rawUrl)
}

function resolveRequestUrl(req: Request): string | null {
  try {
    const rawUrlCandidates = [resolveRequestField(req, "url"), resolveRequestField(req, "nextUrl")]
    for (const rawUrlCandidate of rawUrlCandidates) {
      const resolvedUrl = resolveRequestUrlFromCandidate(rawUrlCandidate)
      if (resolvedUrl) {
        return resolvedUrl
      }
    }
    return null
  } catch {
    return null
  }
}

function resolveSearchParams(req: Request): URLSearchParams {
  const rawUrl = resolveRequestUrl(req)
  if (!rawUrl) {
    return new URLSearchParams()
  }
  try {
    return new URL(rawUrl).searchParams
  } catch {
    try {
      return new URL(rawUrl, "http://localhost").searchParams
    } catch {
      return new URLSearchParams()
    }
  }
}

function normalizeAuthorizationHeaderValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (Array.isArray(value)) {
    for (const candidateValue of value) {
      const normalizedCandidateValue = normalizeAuthorizationHeaderValue(candidateValue)
      if (normalizedCandidateValue) {
        return normalizedCandidateValue
      }
    }
    return null
  }
  if (typeof value === "string") {
    const normalizedValue = value.trim()
    return normalizedValue.length > 0 ? normalizedValue : null
  }
  const serializedValue = String(value).trim()
  if (
    serializedValue.length === 0 ||
    serializedValue === "[object Object]" ||
    serializedValue === "[object Undefined]" ||
    serializedValue === "[object Null]"
  ) {
    return null
  }
  return serializedValue
}

function resolveAuthorizationFromHeaderMap(headers: Record<string, unknown>): string | null {
  for (const [headerName, rawHeaderValue] of Object.entries(headers)) {
    if (headerName.toLowerCase() !== "authorization") {
      continue
    }
    const rawValue = resolveCallableValue(rawHeaderValue as unknown)
    const normalizedValue = normalizeAuthorizationHeaderValue(rawValue)
    if (normalizedValue) {
      return normalizedValue
    }
  }
  return null
}

function resolveAuthorizationFromIterable(headers: Iterable<unknown>): string | null {
  for (const entry of headers) {
    if (!Array.isArray(entry) || entry.length < 2) {
      continue
    }
    const headerName = String(entry[0]).trim().toLowerCase()
    if (headerName !== "authorization") {
      continue
    }
    const rawValue = resolveCallableValue(entry[1] as unknown)
    const normalizedValue = normalizeAuthorizationHeaderValue(rawValue)
    if (normalizedValue) {
      return normalizedValue
    }
  }
  return null
}

function resolveAuthorizationFromFlatHeaderArray(headers: unknown[]): string | null {
  if (headers.length < 2) {
    return null
  }
  for (let index = 0; index + 1 < headers.length; index += 2) {
    const normalizedHeaderName = String(headers[index]).trim().toLowerCase()
    if (normalizedHeaderName !== "authorization") {
      continue
    }
    const normalizedValue = normalizeAuthorizationHeaderValue(resolveCallableValue(headers[index + 1] as unknown))
    if (normalizedValue) {
      return normalizedValue
    }
  }
  return null
}

function resolveAuthorizationFromEntriesAccessor(rawHeaders: { entries?: unknown }): string | null {
  const maybeEntries = rawHeaders.entries
  if (typeof maybeEntries !== "function") {
    return null
  }
  try {
    const resolvedEntries = maybeEntries.call(rawHeaders) as unknown
    if (!resolvedEntries || typeof (resolvedEntries as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function") {
      return null
    }
    return resolveAuthorizationFromIterable(resolvedEntries as Iterable<unknown>)
  } catch {
    return null
  }
}

function resolveAuthorizationFromForEachAccessor(rawHeaders: { forEach?: unknown }): string | null {
  const maybeForEach = rawHeaders.forEach
  if (typeof maybeForEach !== "function") {
    return null
  }
  let resolvedAuthorization: string | null = null
  try {
    maybeForEach.call(rawHeaders, (firstArg: unknown, secondArg: unknown) => {
      if (resolvedAuthorization) {
        return
      }
      const candidates: Array<{ headerName: unknown; headerValue: unknown }> = [
        { headerName: secondArg, headerValue: firstArg },
        { headerName: firstArg, headerValue: secondArg },
      ]
      for (const candidate of candidates) {
        const normalizedHeaderName = String(candidate.headerName).trim().toLowerCase()
        if (normalizedHeaderName !== "authorization") {
          continue
        }
        const normalizedValue = normalizeAuthorizationHeaderValue(resolveCallableValue(candidate.headerValue as unknown))
        if (normalizedValue) {
          resolvedAuthorization = normalizedValue
          return
        }
      }
    })
  } catch {
    return null
  }
  return resolvedAuthorization
}

function resolveAuthorizationHeader(req: Request): string | null {
  try {
    const rawHeaders = resolveCallableValue((req as { headers?: unknown }).headers)
    if (!rawHeaders || (typeof rawHeaders !== "object" && typeof rawHeaders !== "function")) {
      return null
    }

    const maybeGet = (rawHeaders as { get?: unknown }).get
    if (typeof maybeGet === "function") {
      const headerNames = ["authorization", "Authorization", "AUTHORIZATION"]
      for (const headerName of headerNames) {
        let rawValue: unknown
        try {
          rawValue = maybeGet.call(rawHeaders, headerName)
        } catch {
          continue
        }
        const normalizedValue = normalizeAuthorizationHeaderValue(rawValue)
        if (normalizedValue) {
          return normalizedValue
        }
      }
    }

    if (Array.isArray(rawHeaders)) {
      const flatHeaderAuthorization = resolveAuthorizationFromFlatHeaderArray(rawHeaders)
      if (flatHeaderAuthorization) {
        return flatHeaderAuthorization
      }
    }

    const entriesAuthorization = resolveAuthorizationFromEntriesAccessor(rawHeaders as { entries?: unknown })
    if (entriesAuthorization) {
      return entriesAuthorization
    }
    const forEachAuthorization = resolveAuthorizationFromForEachAccessor(rawHeaders as { forEach?: unknown })
    if (forEachAuthorization) {
      return forEachAuthorization
    }

    if (typeof rawHeaders === "object") {
      const maybeIterator = (rawHeaders as { [Symbol.iterator]?: unknown })[Symbol.iterator]
      if (typeof maybeIterator === "function") {
        try {
          const iterableAuthorization = resolveAuthorizationFromIterable(rawHeaders as Iterable<unknown>)
          if (iterableAuthorization) {
            return iterableAuthorization
          }
        } catch {
          // ignore iterable-access errors
        }
      }
      const directHeaderMatch = resolveAuthorizationFromHeaderMap(rawHeaders as Record<string, unknown>)
      if (directHeaderMatch) {
        return directHeaderMatch
      }
      const nestedHeaders = resolveCallableValue((rawHeaders as { headers?: unknown }).headers)
      if (nestedHeaders && typeof nestedHeaders === "object") {
        return resolveAuthorizationFromHeaderMap(nestedHeaders as Record<string, unknown>)
      }
    }
    return null
  } catch {
    return null
  }
}

function resolveCronSecrets(): string[] {
  const secretCandidates = [process.env.ORDER_WORKER_SECRET, process.env.CRON_SECRET]
  const placeholderValues = new Set(["undefined", "null", "none", "nil", "n/a", "na", "-", "false", "0", "off", "disabled"])
  const normalizeSecretToken = (secretToken: string): string => {
    const trimmedToken = secretToken.trim()
    if (
      (trimmedToken.startsWith('"') && trimmedToken.endsWith('"')) ||
      (trimmedToken.startsWith("'") && trimmedToken.endsWith("'"))
    ) {
      return trimmedToken.slice(1, -1).trim()
    }
    return trimmedToken
  }
  const splitSecretCandidate = (secretCandidate: string): string[] => {
    const normalizedCandidate = normalizeSecretToken(secretCandidate)
    if (!normalizedCandidate) {
      return []
    }
    let parsedJsonCandidate = false
    if (
      (normalizedCandidate.startsWith("[") && normalizedCandidate.endsWith("]")) ||
      (normalizedCandidate.startsWith("{") && normalizedCandidate.endsWith("}"))
    ) {
      try {
        const parsedCandidate = JSON.parse(normalizedCandidate)
        parsedJsonCandidate = true
        if (Array.isArray(parsedCandidate)) {
          return parsedCandidate.map((value) => String(value))
        }
        if (parsedCandidate && typeof parsedCandidate === "object") {
          const candidateRecord = parsedCandidate as Record<string, unknown>
          const arrayCarrierKeys = ["secrets", "values", "tokens", "items"] as const
          for (const arrayCarrierKey of arrayCarrierKeys) {
            const carrierValue = candidateRecord[arrayCarrierKey]
            if (Array.isArray(carrierValue)) {
              return carrierValue.map((value) => String(value))
            }
          }
          const singleCarrierKeys = ["secret", "value", "token"] as const
          for (const singleCarrierKey of singleCarrierKeys) {
            const carrierValue = candidateRecord[singleCarrierKey]
            if (carrierValue !== undefined && carrierValue !== null) {
              return [String(carrierValue)]
            }
          }
        }
      } catch {
        // fall through to delimiter split
      }
      if (parsedJsonCandidate) {
        return []
      }
    }
    return normalizedCandidate
      .split(/[,\n;]+/)
      .map((tokenPart) => tokenPart.trim())
      .filter((tokenPart) => tokenPart.length > 0)
  }
  const normalizedSecrets = secretCandidates
    .flatMap((secretCandidate) =>
      typeof secretCandidate === "string"
        ? splitSecretCandidate(secretCandidate)
            .map((secretToken) => normalizeSecretToken(secretToken))
            .filter((secretToken) => {
              if (secretToken.length === 0) {
                return false
              }
              return !placeholderValues.has(secretToken.toLowerCase())
            })
        : [],
    )
  return Array.from(new Set(normalizedSecrets))
}

function matchesBearerSecret(authHeader: string | null, secret: string): boolean {
  if (!authHeader) {
    return false
  }
  const bearerSegments = authHeader
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)

  for (const bearerSegment of bearerSegments) {
    const segmentMatch = bearerSegment.match(/^Bearer\s+(.+)$/i)
    if (!segmentMatch?.[1]) {
      continue
    }
    const token = segmentMatch[1].trim()
    if (!token) {
      continue
    }
    const normalizedToken =
      (token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))
        ? token.slice(1, -1).trim()
        : token
    if (normalizedToken === secret) {
      return true
    }
  }

  return false
}

function matchesAnyBearerSecret(authHeader: string | null, secrets: string[]): boolean {
  return secrets.some((secret) => matchesBearerSecret(authHeader, secret))
}

function normalizeRouteErrorMessage(value: unknown): string {
  if (typeof value !== "string") {
    return "Failed to run order worker"
  }
  const normalizedValue = value.trim().replace(/\s+/g, " ")
  if (!normalizedValue) {
    return "Failed to run order worker"
  }
  return normalizedValue.slice(0, 256)
}

export async function GET(req: Request) {
  console.log("⏰ [CRON-ORDER-WORKER] Cron request received")

  try {
    const authHeader = resolveAuthorizationHeader(req)
    const cronSecrets = resolveCronSecrets()

    if (cronSecrets.length > 0) {
      if (!matchesAnyBearerSecret(authHeader, cronSecrets)) {
        console.warn("⚠️ [CRON-ORDER-WORKER] Invalid authorization header")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    } else {
      console.warn("⚠️ [CRON-ORDER-WORKER] No CRON_SECRET set, allowing request (development mode)")
    }

    const searchParams = resolveSearchParams(req)
    const limit = normalizeLimit(searchParams.get("limit"))
    const maxAgeMs = normalizeMaxAgeMs(searchParams.get("maxAgeMs"))

    const result = await orderExecutionWorker.processPendingOrders({ limit, maxAgeMs })
    const autoCleanup = await runScheduledCleanupTick({ source: "cron_order_worker" })

    return NextResponse.json(
      {
        success: true,
        timestamp: new Date().toISOString(),
        result,
        autoCleanup,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("❌ [CRON-ORDER-WORKER] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: normalizeRouteErrorMessage(error?.message),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  return GET(req)
}

