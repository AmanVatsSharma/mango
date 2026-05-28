/**
 * @file trading-access.ts
 * @module server/trading-access
 * @description Authenticated ownership guards for trading account/order/position mutations.
 * @author StockTrade
 * @created 2026-02-15
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { BRAND_IDENTITY } from "@/Branding"
import { decode } from "next-auth/jwt"
import { headers } from "next/headers"

const MAX_RESPONSE_ERROR_MESSAGE_LENGTH = 300
const MAX_SCOPE_USER_ID_LENGTH = 128
const MAX_OWNERSHIP_RESOURCE_ID_LENGTH = 128
const REQUEST_URL_FALLBACK_BASE = "http://localhost"

export class TradingAccessError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = "TradingAccessError"
    this.statusCode = statusCode
  }
}

function sanitizeErrorMessage(rawMessage: string): string {
  const normalized = rawMessage.replace(/\s+/g, " ").trim()
  if (normalized.length <= MAX_RESPONSE_ERROR_MESSAGE_LENGTH) {
    return normalized
  }
  return `${normalized.slice(0, MAX_RESPONSE_ERROR_MESSAGE_LENGTH - 1)}…`
}

function resolveNonEmptyStringValue(value: unknown): string | undefined {
  const resolvedValue = resolveCallableValue(value)
  if (typeof resolvedValue === "string") {
    const normalizedValue = resolvedValue.trim()
    return normalizedValue.length > 0 ? normalizedValue : undefined
  }
  if (!resolvedValue || (typeof resolvedValue !== "object" && typeof resolvedValue !== "function")) {
    return undefined
  }
  try {
    const serializedValue = String(resolvedValue).trim()
    if (
      serializedValue.length === 0 ||
      serializedValue === "[object Object]" ||
      serializedValue === "[object Undefined]" ||
      serializedValue === "[object Null]"
    ) {
      return undefined
    }
    return serializedValue
  } catch {
    return undefined
  }
}

function normalizeErrorMessage(rawMessage: unknown, fallbackMessage: string): string {
  const resolvedMessage = resolveNonEmptyStringValue(rawMessage)
  if (resolvedMessage) {
    return sanitizeErrorMessage(resolvedMessage)
  }
  return sanitizeErrorMessage(fallbackMessage)
}

function extractIssueMessage(anyError: any): string | null {
  const resolvedIssues = resolveCallableValue(anyError?.issues)
  if (!Array.isArray(resolvedIssues) || resolvedIssues.length === 0) {
    return null
  }
  const firstIssue = resolveCallableValue(resolvedIssues[0])
  if (typeof firstIssue === "string") {
    const normalizedIssue = resolveNonEmptyStringValue(firstIssue)
    return normalizedIssue ?? null
  }
  if (!firstIssue || typeof firstIssue !== "object") {
    return null
  }
  const issueMessage = resolveNonEmptyStringValue(resolveCallableValue((firstIssue as { message?: unknown }).message))
  return issueMessage ?? null
}

function extractHttpClientErrorMessage(anyError: any): string | null {
  const resolvedError = resolveCallableValue(anyError)
  const extractMessageCandidate = (candidate: unknown): string | null => {
    const resolvedCandidateValue = resolveNonEmptyStringValue(candidate)
    if (resolvedCandidateValue) {
      return resolvedCandidateValue
    }
    if (!candidate || typeof candidate !== "object") {
      return null
    }
    const nestedCandidates = [
      (candidate as any).message,
      (candidate as any).error,
      (candidate as any).detail,
      (candidate as any).title,
    ]
    for (const nestedCandidate of nestedCandidates) {
      const resolvedNestedCandidate = resolveNonEmptyStringValue(nestedCandidate)
      if (resolvedNestedCandidate) {
        return resolvedNestedCandidate
      }
    }
    return null
  }

  const response = resolveCallableValue((resolvedError as any)?.response)
  const responseData = resolveCallableValue((response as any)?.data)
  const responseDataMessage = resolveNonEmptyStringValue(responseData)
  if (responseDataMessage) {
    return responseDataMessage
  }

  if (!responseData || typeof responseData !== "object") {
    return null
  }

  const messageCandidates = [
    resolveCallableValue((responseData as any).message),
    resolveCallableValue((responseData as any).error),
    resolveCallableValue((responseData as any).detail),
    resolveCallableValue((responseData as any).data),
    resolveCallableValue((responseData as any).reason),
  ]
  for (const candidate of messageCandidates) {
    const resolvedCandidate = extractMessageCandidate(candidate)
    if (resolvedCandidate) {
      return resolvedCandidate
    }
  }

  const errorCollections = [
    resolveCallableValue((responseData as any).errors),
    resolveCallableValue((responseData as any).issues),
  ]
  for (const collection of errorCollections) {
    if (!Array.isArray(collection)) {
      continue
    }
    for (const item of collection) {
      const resolvedItem = resolveNonEmptyStringValue(item)
      if (resolvedItem) {
        return resolvedItem
      }
      if (!item || typeof item !== "object") {
        continue
      }
      const nestedCandidates = [
        (item as any).message,
        (item as any).error,
        (item as any).detail,
        (item as any).title,
      ]
      for (const nestedCandidate of nestedCandidates) {
        const resolvedCandidate = extractMessageCandidate(nestedCandidate)
        if (resolvedCandidate) {
          return resolvedCandidate
        }
      }
    }
  }

  return null
}

function coerceHttpStatus(value: unknown): number | null {
  const resolvedValue = resolveCallableValue(value)
  if (Number.isInteger(resolvedValue) && resolvedValue >= 400 && resolvedValue <= 599) {
    return resolvedValue
  }
  if (typeof resolvedValue === "string" && /^\d{3}$/.test(resolvedValue.trim())) {
    const parsed = Number(resolvedValue.trim())
    if (Number.isInteger(parsed) && parsed >= 400 && parsed <= 599) {
      return parsed
    }
  }
  if (resolvedValue && (typeof resolvedValue === "object" || typeof resolvedValue === "function")) {
    try {
      const primitiveNumericValue = Number(resolvedValue)
      if (Number.isInteger(primitiveNumericValue) && primitiveNumericValue >= 400 && primitiveNumericValue <= 599) {
        return primitiveNumericValue
      }
    } catch {
      // Continue to string coercion fallback.
    }
    try {
      const primitiveStringValue = String(resolvedValue).trim()
      if (/^\d{3}$/.test(primitiveStringValue)) {
        const parsed = Number(primitiveStringValue)
        if (Number.isInteger(parsed) && parsed >= 400 && parsed <= 599) {
          return parsed
        }
      }
    } catch {
      return null
    }
  }
  return null
}

function normalizeHttpStatus(candidateStatus: unknown, defaultStatus: number = 500): number {
  return coerceHttpStatus(candidateStatus) ?? coerceHttpStatus(defaultStatus) ?? 500
}

function mapPrismaErrorStatus(anyError: any): number | null {
  const normalizedName = resolveNonEmptyStringValue(anyError?.name) ?? ""
  if (normalizedName === "PrismaClientValidationError") {
    return 400
  }

  const prismaCode = resolveNonEmptyStringValue(anyError?.code) ?? ""
  if (prismaCode === "P2025") {
    return 404
  }
  if (prismaCode === "P2002") {
    return 409
  }
  if (normalizedName === "PrismaClientKnownRequestError" && prismaCode.startsWith("P2")) {
    return 400
  }

  return null
}

function mapJsonParsingErrorStatus(anyError: any): number | null {
  const name = resolveNonEmptyStringValue(anyError?.name) ?? ""
  const message = resolveNonEmptyStringValue(anyError?.message) ?? ""
  if (name !== "SyntaxError" && name !== "TypeError") {
    return null
  }

  const normalizedMessage = message.toLowerCase()
  if (normalizedMessage.includes("json") && (normalizedMessage.includes("parse") || normalizedMessage.includes("unexpected"))) {
    return 400
  }

  return null
}

function mapRequestUrlParsingErrorStatus(anyError: any): number | null {
  const name = resolveNonEmptyStringValue(anyError?.name) ?? ""
  const message = resolveNonEmptyStringValue(anyError?.message) ?? ""
  const code = resolveNonEmptyStringValue(anyError?.code) ?? ""
  if (name !== "TypeError") {
    return null
  }

  const normalizedMessage = message.toLowerCase()
  if (code.toUpperCase() === "ERR_INVALID_URL" || normalizedMessage.includes("invalid url")) {
    return 400
  }

  return null
}

function getNormalizedErrorCode(anyError: any): string {
  const resolvedError = resolveCallableValue(anyError)
  const resolvedCause = resolveCallableValue((resolvedError as any)?.cause)
  const codeCandidates = [
    (resolvedError as any)?.code,
    (resolvedCause as any)?.code,
    (resolvedError as any)?.errno,
  ]
  for (const candidate of codeCandidates) {
    const normalizedCandidate = resolveNonEmptyStringValue(candidate)
    if (normalizedCandidate) {
      return normalizedCandidate.toUpperCase()
    }
  }
  return ""
}

function getErrorMessageForClassification(anyError: any): string {
  const resolvedError = resolveCallableValue(anyError)
  const resolvedCause = resolveCallableValue((resolvedError as any)?.cause)
  const messageCandidates = [(resolvedError as any)?.message, (resolvedCause as any)?.message]
  for (const candidate of messageCandidates) {
    const normalizedCandidate = resolveNonEmptyStringValue(candidate)
    if (normalizedCandidate) {
      return normalizedCandidate.toLowerCase()
    }
  }
  return ""
}

function mapTimeoutErrorStatus(anyError: any): number | null {
  const name = resolveNonEmptyStringValue(anyError?.name) ?? ""
  const code = getNormalizedErrorCode(anyError)
  const message = getErrorMessageForClassification(anyError)

  const timeoutCodes = new Set(["ETIMEDOUT", "ECONNABORTED", "UND_ERR_CONNECT_TIMEOUT"])
  if (timeoutCodes.has(code)) {
    return 504
  }

  if (name === "TimeoutError") {
    return 504
  }

  if (name === "AbortError" && (message.includes("timeout") || message.includes("timed out"))) {
    return 504
  }

  if (message.includes("request timeout") || message.includes("timed out")) {
    return 504
  }

  return null
}

function mapNetworkErrorStatus(anyError: any): number | null {
  const name = resolveNonEmptyStringValue(anyError?.name) ?? ""
  const code = getNormalizedErrorCode(anyError)
  const message = getErrorMessageForClassification(anyError)

  const transientNetworkCodes = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT"])
  if (transientNetworkCodes.has(code)) {
    return 503
  }

  if (name === "TypeError" && (message.includes("fetch failed") || message.includes("network error"))) {
    return 503
  }

  if (message.includes("connection refused") || message.includes("dns lookup failed")) {
    return 503
  }

  return null
}

function mapGenericErrorStatus(anyError: any): number | null {
  const resolvedError = resolveCallableValue(anyError)
  const resolvedResponse = resolveCallableValue((resolvedError as any)?.response)
  const resolvedCause = resolveCallableValue((resolvedError as any)?.cause)
  const resolvedCauseResponse = resolveCallableValue((resolvedCause as any)?.response)
  return (
    coerceHttpStatus((resolvedError as any)?.statusCode) ??
    coerceHttpStatus((resolvedError as any)?.status) ??
    coerceHttpStatus((resolvedResponse as any)?.statusCode) ??
    coerceHttpStatus((resolvedResponse as any)?.status) ??
    coerceHttpStatus((resolvedCause as any)?.statusCode) ??
    coerceHttpStatus((resolvedCause as any)?.status) ??
    coerceHttpStatus((resolvedCauseResponse as any)?.statusCode) ??
    coerceHttpStatus((resolvedCauseResponse as any)?.status)
  )
}

function normalizeOwnedResourceId(resourceId: string, notFoundMessage: string): string {
  const normalizedId = typeof resourceId === "string" ? resourceId.trim() : ""
  if (!normalizedId || normalizedId.length > MAX_OWNERSHIP_RESOURCE_ID_LENGTH) {
    throw new TradingAccessError(notFoundMessage, 404)
  }
  return normalizedId
}

export function resolveTradingErrorResponse(
  error: unknown,
  fallbackMessage: string = "Invalid request",
  fallbackStatus: number = 500,
): { message: string; status: number } {
  const anyError = resolveCallableValue(error) as any
  const topLevelErrorMessage = resolveNonEmptyStringValue(error)
  const resolvedCause = resolveCallableValue(anyError?.cause)
  const causeMessage = resolveNonEmptyStringValue(
    typeof resolvedCause === "string" ? resolvedCause : (resolvedCause as { message?: unknown })?.message,
  )
  const message = normalizeErrorMessage(
    extractIssueMessage(anyError) ??
      extractHttpClientErrorMessage(anyError) ??
      extractHttpClientErrorMessage(resolvedCause) ??
      resolveNonEmptyStringValue(anyError?.message) ??
      resolveNonEmptyStringValue(anyError?.error) ??
      resolveNonEmptyStringValue(anyError?.response?.statusText) ??
      resolveNonEmptyStringValue(anyError?.statusText) ??
      resolveNonEmptyStringValue((resolvedCause as { statusText?: unknown })?.statusText) ??
      causeMessage ??
      topLevelErrorMessage,
    fallbackMessage,
  )

  if (error instanceof TradingAccessError) {
    return { message, status: normalizeHttpStatus(error.statusCode, fallbackStatus) }
  }

  if (resolveNonEmptyStringValue(anyError?.name) === "ZodError") {
    return { message, status: 400 }
  }

  const prismaStatus = mapPrismaErrorStatus(anyError)
  if (prismaStatus) {
    return { message, status: prismaStatus }
  }

  const jsonParsingStatus = mapJsonParsingErrorStatus(anyError)
  if (jsonParsingStatus) {
    return { message, status: jsonParsingStatus }
  }

  const requestUrlParsingStatus = mapRequestUrlParsingErrorStatus(anyError)
  if (requestUrlParsingStatus) {
    return { message, status: requestUrlParsingStatus }
  }

  const timeoutStatus = mapTimeoutErrorStatus(anyError)
  if (timeoutStatus) {
    return { message, status: timeoutStatus }
  }

  const networkStatus = mapNetworkErrorStatus(anyError)
  if (networkStatus) {
    return { message, status: networkStatus }
  }

  const genericStatus = mapGenericErrorStatus(anyError)
  if (genericStatus) {
    return { message, status: genericStatus }
  }

  return { message, status: normalizeHttpStatus(fallbackStatus, 500) }
}

export async function requireAuthenticatedUserId(): Promise<string> {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (userId) return userId

  // NextAuth v5 beta doesn't read Authorization: Bearer from route handlers.
  // Mobile app sends the JWT as a Bearer token — decode it manually using the
  // same salt that /api/mobile/token used when encoding it.
  try {
    const reqHeaders = headers()
    const authHeader = reqHeaders.get("authorization")
    if (authHeader?.startsWith("Bearer ")) {
      const bearerToken = authHeader.slice(7)
      const secret = process.env.NEXTAUTH_SECRET
      if (secret && bearerToken) {
        const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? BRAND_IDENTITY.urls.productionBaseUrl
        const useSecureCookies = (() => { try { return new URL(authUrl).protocol === "https:" } catch { return true } })()
        const salt = useSecureCookies ? "__Secure-authjs.session-token" : "authjs.session-token"
        const decoded = await decode({ token: bearerToken, secret, salt })
        const bearerId = (decoded as { id?: string } | null)?.id ?? decoded?.sub
        if (bearerId) return bearerId
      }
    }
  } catch {
    // fall through to Unauthorized
  }

  throw new TradingAccessError("Unauthorized", 401)
}

function readObjectPropertySafely(source: unknown, key: string): unknown {
  if (!source || typeof source !== "object") {
    return undefined
  }
  try {
    return (source as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

function resolveCallableValue(value: unknown): unknown {
  if (typeof value !== "function") {
    return value
  }
  try {
    return (value as () => unknown)()
  } catch {
    return undefined
  }
}

function getNextUrlSearchParams(req: { nextUrl?: { searchParams?: unknown; search?: unknown } }): URLSearchParams | null {
  const nextUrl = readObjectPropertySafely(req, "nextUrl")
  const extractSearchParamsFromUrlString = (value: string): string | null => {
    try {
      const parsedAbsoluteUrl = new URL(value)
      const serializedSearchParams = parsedAbsoluteUrl.searchParams.toString().trim()
      return serializedSearchParams.length > 0 ? serializedSearchParams : null
    } catch {
      try {
        const parsedRelativeUrl = new URL(value, REQUEST_URL_FALLBACK_BASE)
        const serializedSearchParams = parsedRelativeUrl.searchParams.toString().trim()
        return serializedSearchParams.length > 0 ? serializedSearchParams : null
      } catch {
        return null
      }
    }
  }
  const normalizeSerializedSearchParams = (serializedValue: string): string | null => {
    const normalizedValue = serializedValue.trim()
    if (
      normalizedValue.length === 0 ||
      normalizedValue === "[object Object]" ||
      normalizedValue === "[object Undefined]" ||
      normalizedValue === "[object Null]"
    ) {
      return null
    }
    if (normalizedValue.includes("://") || normalizedValue.startsWith("/")) {
      return extractSearchParamsFromUrlString(normalizedValue)
    }
    if (normalizedValue.includes("?") && !normalizedValue.startsWith("?")) {
      const queryIndex = normalizedValue.indexOf("?")
      const queryPortion = normalizedValue.slice(queryIndex + 1).trim()
      return queryPortion.length > 0 ? queryPortion : null
    }
    return normalizedValue.startsWith("?") ? normalizedValue.slice(1) : normalizedValue
  }
  const parseSearchParamsCandidate = (candidate: unknown): URLSearchParams | null => {
    const parseFromSerializedQuery = (serializedValue: string): URLSearchParams | null => {
      const normalizedValue = normalizeSerializedSearchParams(serializedValue)
      return normalizedValue ? new URLSearchParams(normalizedValue) : null
    }
    const shouldTreatAsSerializedQuery = (serializedValue: string): boolean => {
      const trimmedValue = serializedValue.trim()
      return trimmedValue.startsWith("?") || trimmedValue.includes("=") || trimmedValue.includes("&")
    }
    const parseFromIterable = (iterableCandidate: unknown): URLSearchParams | null => {
      try {
        const parsedCandidate = new URLSearchParams(iterableCandidate as URLSearchParams)
        return parseFromSerializedQuery(parsedCandidate.toString())
      } catch {
        return null
      }
    }
    const parseFromRecord = (recordCandidate: Record<string, unknown>): URLSearchParams | null => {
      try {
        const entries = Object.entries(recordCandidate).filter(([, value]) => value !== null && value !== undefined && typeof value !== "function")
        if (entries.length === 0) {
          return null
        }
        const parsedCandidate = new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))
        return parseFromSerializedQuery(parsedCandidate.toString())
      } catch {
        return null
      }
    }
    const hasIterator = (value: unknown): boolean => {
      if (!value || (typeof value !== "object" && typeof value !== "function")) {
        return false
      }
      try {
        return typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function"
      } catch {
        return false
      }
    }

    const resolvedCandidate = resolveCallableValue(candidate)
    if (!resolvedCandidate) {
      return null
    }
    if (typeof resolvedCandidate === "string") {
      return parseFromSerializedQuery(resolvedCandidate)
    }
    if (resolvedCandidate instanceof URLSearchParams) {
      return parseFromSerializedQuery(resolvedCandidate.toString())
    }
    if (typeof resolvedCandidate !== "object") {
      return null
    }
    try {
      const primitiveSerializedCandidate = String(resolvedCandidate)
      if (shouldTreatAsSerializedQuery(primitiveSerializedCandidate)) {
        const parsedFromPrimitiveSerialized = parseFromSerializedQuery(primitiveSerializedCandidate)
        if (parsedFromPrimitiveSerialized) {
          return parsedFromPrimitiveSerialized
        }
      }
    } catch {
      // Continue to explicit toString parser fallback.
    }
    const candidateToString = readObjectPropertySafely(resolvedCandidate, "toString")
    if (typeof candidateToString === "function") {
      try {
        const serializedValue = String((candidateToString as (this: unknown) => string).call(resolvedCandidate))
        if (shouldTreatAsSerializedQuery(serializedValue)) {
          const parsedFromSerialized = parseFromSerializedQuery(serializedValue)
          if (parsedFromSerialized) {
            return parsedFromSerialized
          }
        }
      } catch {
        // Continue to structured parser fallback.
      }
    }
    if (Array.isArray(resolvedCandidate) || hasIterator(resolvedCandidate)) {
      return parseFromIterable(resolvedCandidate)
    }
    return parseFromRecord(resolvedCandidate as Record<string, unknown>)
  }
  const rawSearch = resolveCallableValue(readObjectPropertySafely(nextUrl, "search"))
  const parseHrefSearch = (): URLSearchParams | null => {
    const rawHref =
      resolveRequestUrlValue(resolveCallableValue(readObjectPropertySafely(nextUrl, "href"))) ||
      resolveRequestUrlValue(resolveCallableValue(nextUrl))
    if (!rawHref) {
      return null
    }
    try {
      return new URL(rawHref).searchParams
    } catch {
      try {
        return new URL(rawHref, REQUEST_URL_FALLBACK_BASE).searchParams
      } catch {
        return null
      }
    }
  }
  const serializeRawSearch = (): string | null => {
    const parsedSearch = parseSearchParamsCandidate(rawSearch)
    if (!parsedSearch) {
      return null
    }
    const serializedSearch = parsedSearch.toString()
    return serializedSearch.length > 0 ? serializedSearch : null
  }
  const parseRawSearch = (): URLSearchParams | null => {
    const serializedRawSearch = serializeRawSearch()
    if (!serializedRawSearch) {
      return null
    }
    return new URLSearchParams(serializedRawSearch)
  }

  const nextSearchParams = resolveCallableValue(readObjectPropertySafely(nextUrl, "searchParams"))
  return parseSearchParamsCandidate(nextSearchParams) ?? parseRawSearch() ?? parseHrefSearch()
}

function resolveRequestUrlValue(urlValue: unknown): string {
  const looksUrlLikeValue = (value: string): boolean => {
    const trimmedValue = value.trim()
    return (
      trimmedValue.startsWith("/") ||
      trimmedValue.startsWith("?") ||
      trimmedValue.includes("://") ||
      trimmedValue.includes("=") ||
      trimmedValue.includes("&")
    )
  }

  const resolveValueAsString = (value: unknown): string => {
    const resolvedValue = resolveCallableValue(value)
    if (typeof resolvedValue === "string") {
      return resolvedValue.trim()
    }
    if (resolvedValue instanceof URLSearchParams) {
      return resolvedValue.toString().trim()
    }
    if (resolvedValue && typeof resolvedValue === "object") {
      try {
        const nestedHref = resolveCallableValue(readObjectPropertySafely(resolvedValue, "href"))
        if (typeof nestedHref === "string" && nestedHref.trim().length > 0) {
          return nestedHref.trim()
        }
      } catch {
        // Continue to serialization fallback.
      }
      try {
        const primitiveSerialized = String(resolvedValue).trim()
        if (looksUrlLikeValue(primitiveSerialized) && primitiveSerialized !== "[object Object]") {
          return primitiveSerialized
        }
      } catch {
        // Continue to explicit toString fallback.
      }
    }
    if (resolvedValue && typeof (resolvedValue as { toString?: unknown }).toString === "function") {
      try {
        const serialized = String((resolvedValue as { toString: () => string }).toString()).trim()
        if (serialized === "[object Object]" || !looksUrlLikeValue(serialized)) {
          return ""
        }
        return serialized
      } catch {
        return ""
      }
    }
    return ""
  }

  const normalizePathnameValue = (rawPathnameValue: string): string => {
    const trimmedPathnameValue = rawPathnameValue.trim()
    if (trimmedPathnameValue.length === 0) {
      return ""
    }
    try {
      if (trimmedPathnameValue.includes("://")) {
        return new URL(trimmedPathnameValue).pathname
      }
      return new URL(trimmedPathnameValue, REQUEST_URL_FALLBACK_BASE).pathname
    } catch {
      const [pathnameWithoutQueryOrHash] = trimmedPathnameValue.split(/[?#]/)
      return pathnameWithoutQueryOrHash?.trim() ?? ""
    }
  }

  if (typeof urlValue === "string") {
    return urlValue.trim()
  }
  if (urlValue && typeof urlValue === "object") {
    try {
      const hrefValue = resolveValueAsString(resolveCallableValue((urlValue as { href?: unknown }).href))
      if (hrefValue) {
        return hrefValue
      }
    } catch {
      // Continue to other representations.
    }
    try {
      const pathnameValue = resolveValueAsString(resolveCallableValue((urlValue as { pathname?: unknown }).pathname))
      if (pathnameValue.length > 0) {
        const normalizedPathname = normalizePathnameValue(pathnameValue)
        if (!normalizedPathname) {
          return ""
        }
        const searchValue = resolveValueAsString(resolveCallableValue((urlValue as { search?: unknown }).search))
        if (!searchValue) {
          return normalizedPathname
        }
        const normalizedSearch = searchValue.startsWith("?") ? searchValue : `?${searchValue}`
        return `${normalizedPathname}${normalizedSearch}`
      }
    } catch {
      // Continue to other representations.
    }
  }
  return resolveValueAsString(urlValue)
}

export function getRequestSearchParams(req: Pick<Request, "url"> & { nextUrl?: { searchParams?: unknown; search?: unknown } }): URLSearchParams {
  const nextUrlSearchParams = getNextUrlSearchParams(req)
  const requestUrlCandidate = (() => {
    try {
      return req?.url
    } catch {
      return undefined
    }
  })()
  const rawUrl = resolveRequestUrlValue(requestUrlCandidate)
  if (!rawUrl) {
    return nextUrlSearchParams ?? new URLSearchParams()
  }

  try {
    return new URL(rawUrl).searchParams
  } catch {
    try {
      return new URL(rawUrl, REQUEST_URL_FALLBACK_BASE).searchParams
    } catch {
      return nextUrlSearchParams ?? new URLSearchParams()
    }
  }
}

export function assertRequestedUserScope(
  requestedUserId: unknown,
  authenticatedUserId: string,
  message: string = "Forbidden",
): void {
  if (requestedUserId === null || requestedUserId === undefined) {
    return
  }

  if (typeof requestedUserId !== "string") {
    throw new TradingAccessError("Invalid user scope", 400)
  }

  const normalizedRequestedUserId = requestedUserId.trim()
  if (!normalizedRequestedUserId) {
    return
  }
  if (normalizedRequestedUserId.length > MAX_SCOPE_USER_ID_LENGTH) {
    throw new TradingAccessError("Invalid user scope", 400)
  }
  if (normalizedRequestedUserId !== authenticatedUserId) {
    throw new TradingAccessError(message, 403)
  }
}

export async function assertTradingAccountOwnership(
  tradingAccountId: string,
  userId: string,
  demoTradingAccountId?: string,
): Promise<void> {
  const normalizedTradingAccountId = normalizeOwnedResourceId(tradingAccountId, "Trading account not found")
  const tradingAccount = await prisma.tradingAccount.findUnique({
    where: { id: normalizedTradingAccountId },
    select: { id: true, userId: true },
  })

  if (!tradingAccount) {
    throw new TradingAccessError("Trading account not found", 404)
  }

  const isLiveOwned = tradingAccount.userId === userId
  const isDemoOwned = demoTradingAccountId
    ? normalizedTradingAccountId === demoTradingAccountId
    : false
  if (!isLiveOwned && !isDemoOwned) {
    throw new TradingAccessError("Forbidden", 403)
  }
}

export async function assertOrderOwnership(orderId: string, userId: string): Promise<void> {
  const normalizedOrderId = normalizeOwnedResourceId(orderId, "Order not found")
  const order = await prisma.order.findUnique({
    where: { id: normalizedOrderId },
    include: {
      tradingAccount: {
        select: { userId: true },
      },
    },
  })

  if (!order) {
    throw new TradingAccessError("Order not found", 404)
  }

  // Defensive guard for referential integrity drift.
  if (!order.tradingAccount?.userId) {
    throw new TradingAccessError("Order not found", 404)
  }

  if (order.tradingAccount.userId !== userId) {
    throw new TradingAccessError("Forbidden", 403)
  }
}

export async function getOwnedPositionContext(positionId: string, userId: string): Promise<{
  positionId: string
  tradingAccountId: string
}> {
  const normalizedPositionId = normalizeOwnedResourceId(positionId, "Position not found")
  const position = await prisma.position.findUnique({
    where: { id: normalizedPositionId },
    select: {
      id: true,
      tradingAccountId: true,
      tradingAccount: {
        select: { userId: true },
      },
    },
  })

  if (!position) {
    throw new TradingAccessError("Position not found", 404)
  }

  // Defensive guard for referential integrity drift.
  if (!position.tradingAccount?.userId) {
    throw new TradingAccessError("Position not found", 404)
  }

  if (position.tradingAccount.userId !== userId) {
    throw new TradingAccessError("Forbidden", 403)
  }

  return { positionId: position.id, tradingAccountId: position.tradingAccountId }
}

