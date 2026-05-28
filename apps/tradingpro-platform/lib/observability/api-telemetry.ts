/**
 * @file api-telemetry.ts
 * @module lib/observability
 * @description Small helper for consistent API request telemetry logging (requestId + duration).
 * @author StockTrade
 * @created 2026-01-24
 */

import { withRequest } from "@/lib/observability/logger"

export type ApiTelemetryConfig = {
  name: string
}

const MAX_TELEMETRY_ERROR_MESSAGE_LENGTH = 500

function normalizeTelemetryErrorMessage(rawMessage: string): string | undefined {
  const normalized = rawMessage.replace(/\s+/g, " ").trim()
  if (normalized.length === 0) {
    return undefined
  }
  if (normalized.length <= MAX_TELEMETRY_ERROR_MESSAGE_LENGTH) {
    return normalized
  }
  return `${normalized.slice(0, MAX_TELEMETRY_ERROR_MESSAGE_LENGTH - 1)}…`
}

function resolveTelemetryStringValue(value: unknown): string | undefined {
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

function resolveNextUrlPathname(req: Request): string | undefined {
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

  const resolveUrlCandidate = (value: unknown): string => {
    const resolvedValue = resolveCallableValue(value)
    if (typeof resolvedValue === "string") {
      return resolvedValue.trim()
    }
    if (!resolvedValue || typeof resolvedValue !== "object") {
      return ""
    }
    try {
      const nestedHref = resolveCallableValue((resolvedValue as { href?: unknown }).href)
      if (typeof nestedHref === "string") {
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
    try {
      const candidateToString = (resolvedValue as { toString?: unknown }).toString
      if (typeof candidateToString !== "function") {
        return ""
      }
      const serializedValue = String((candidateToString as (this: unknown) => string).call(resolvedValue)).trim()
      if (serializedValue === "[object Object]" || !looksUrlLikeValue(serializedValue)) {
        return ""
      }
      return serializedValue
    } catch {
      return ""
    }
  }

  const normalizePathnameValue = (pathnameValue: unknown): string | undefined => {
    const normalizePathCandidate = (rawPathValue: string): string | undefined => {
      const trimmedPathValue = rawPathValue.trim()
      if (trimmedPathValue.length === 0 || trimmedPathValue.startsWith("?")) {
        return undefined
      }
      if (trimmedPathValue.startsWith("/")) {
        try {
          return new URL(trimmedPathValue, "http://localhost").pathname
        } catch {
          const [pathnameWithoutQueryOrHash] = trimmedPathValue.split(/[?#]/)
          return pathnameWithoutQueryOrHash?.trim() || undefined
        }
      }
      if (trimmedPathValue.includes("://")) {
        try {
          return new URL(trimmedPathValue).pathname
        } catch {
          return undefined
        }
      }
      if (!trimmedPathValue.includes("/")) {
        return undefined
      }
      try {
        return new URL(trimmedPathValue, "http://localhost").pathname
      } catch {
        return undefined
      }
    }

    const resolvedPathnameValue = resolveCallableValue(pathnameValue)
    if (typeof resolvedPathnameValue === "string") {
      return normalizePathCandidate(resolvedPathnameValue)
    }
    if (!resolvedPathnameValue || typeof resolvedPathnameValue !== "object") {
      return undefined
    }
    try {
      const primitiveSerializedPathname = String(resolvedPathnameValue).trim()
      if (primitiveSerializedPathname.length > 0 && primitiveSerializedPathname !== "[object Object]" && looksUrlLikeValue(primitiveSerializedPathname)) {
        return normalizePathCandidate(primitiveSerializedPathname)
      }
    } catch {
      // Continue to explicit toString fallback.
    }
    try {
      const pathnameToString = (resolvedPathnameValue as { toString?: unknown }).toString
      if (typeof pathnameToString !== "function") {
        return undefined
      }
      const serializedPathname = String((pathnameToString as (this: unknown) => string).call(resolvedPathnameValue)).trim()
      if (serializedPathname.length === 0 || serializedPathname === "[object Object]") {
        return undefined
      }
      return normalizePathCandidate(serializedPathname)
    } catch {
      return undefined
    }
  }

  try {
    const nextUrl = (req as { nextUrl?: unknown }).nextUrl
    const nextUrlPathname = readNestedPropertySafely(nextUrl, "pathname")
    const normalizedPathname = normalizePathnameValue(nextUrlPathname)
    if (normalizedPathname) {
      return normalizedPathname
    }

    const nextUrlHref = resolveUrlCandidate(readNestedPropertySafely(nextUrl, "href")) || resolveUrlCandidate(nextUrl)
    if (!nextUrlHref) {
      return undefined
    }

    try {
      return new URL(nextUrlHref).pathname
    } catch {
      try {
        return new URL(nextUrlHref, "http://localhost").pathname
      } catch {
        return undefined
      }
    }
  } catch {
    return undefined
  }
}

function readNestedPropertySafely(source: unknown, key: string): unknown {
  if (!source || typeof source !== "object") {
    return undefined
  }
  try {
    return (source as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

function resolveRequestPathname(req: Request): string {
  const resolveRequestUrl = (urlValue: unknown): string => {
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
          const nestedHref = resolveCallableValue((resolvedValue as { href?: unknown }).href)
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
        // Continue to serialization fallback.
      }
      try {
        const pathnameValue = resolveValueAsString(resolveCallableValue((urlValue as { pathname?: unknown }).pathname))
        if (pathnameValue.length > 0) {
          const normalizedPathname = pathnameValue
          const searchValue = resolveValueAsString(resolveCallableValue((urlValue as { search?: unknown }).search))
          if (!searchValue) {
            return normalizedPathname
          }
          const normalizedSearch = searchValue.startsWith("?") ? searchValue : `?${searchValue}`
          return `${normalizedPathname}${normalizedSearch}`
        }
      } catch {
        // Continue to serialization fallback.
      }
    }
    return resolveValueAsString(urlValue)
  }

  const rawUrl = (() => {
    try {
      return resolveRequestUrl((req as { url?: unknown }).url)
    } catch {
      return ""
    }
  })()
  if (!rawUrl) {
    return resolveNextUrlPathname(req) ?? "/unknown"
  }

  try {
    return new URL(rawUrl).pathname
  } catch {
    try {
      return new URL(rawUrl, "http://localhost").pathname
    } catch {
      return resolveNextUrlPathname(req) ?? "/unknown"
    }
  }
}

function resolveHeadersCandidate(candidate: unknown): Pick<Headers, "get"> | null {
  if (candidate && typeof (candidate as { get?: unknown }).get === "function") {
    return candidate as Pick<Headers, "get">
  }
  if (!candidate || (typeof candidate !== "object" && !Array.isArray(candidate))) {
    return null
  }
  try {
    return new Headers(candidate as HeadersInit)
  } catch {
    return null
  }
}

function resolveRequestHeaders(req: Request): Pick<Headers, "get"> {
  let candidateHeaders: unknown
  try {
    candidateHeaders = resolveCallableValue((req as { headers?: unknown }).headers)
  } catch {
    return new Headers()
  }
  const nestedHeadersCandidate = resolveCallableValue(readNestedPropertySafely(candidateHeaders, "headers"))
  const resolvedNestedHeaders = resolveHeadersCandidate(nestedHeadersCandidate)
  if (resolvedNestedHeaders) {
    return resolvedNestedHeaders
  }
  const resolvedHeaders = resolveHeadersCandidate(candidateHeaders)
  if (resolvedHeaders) {
    return resolvedHeaders
  }
  return new Headers()
}

function safeGetHeader(headers: Pick<Headers, "get">, name: string): string | null | undefined {
  const normalizeHeaderValue = (rawHeaderValue: unknown): string | null | undefined => {
    if (rawHeaderValue === null || rawHeaderValue === undefined) {
      return rawHeaderValue as null | undefined
    }
    if (typeof rawHeaderValue === "string") {
      const normalizedHeaderValue = rawHeaderValue.trim()
      return normalizedHeaderValue.length > 0 ? normalizedHeaderValue : undefined
    }
    const serializedHeaderValue = String(rawHeaderValue).trim()
    if (
      serializedHeaderValue.length === 0 ||
      serializedHeaderValue === "[object Object]" ||
      serializedHeaderValue === "[object Undefined]" ||
      serializedHeaderValue === "[object Null]"
    ) {
      return undefined
    }
    return serializedHeaderValue
  }

  const toCanonicalHeaderName = (headerName: string): string => {
    return headerName
      .split("-")
      .map((segment) => {
        if (!segment) {
          return segment
        }
        const lowerSegment = segment.toLowerCase()
        return `${lowerSegment[0]?.toUpperCase() ?? ""}${lowerSegment.slice(1)}`
      })
      .join("-")
  }

  const headerNameCandidates = Array.from(new Set([name, name.toLowerCase(), toCanonicalHeaderName(name), name.toUpperCase()]))
  let sawNullHeaderValue = false

  for (const headerNameCandidate of headerNameCandidates) {
    let rawHeaderValue: unknown
    try {
      rawHeaderValue = headers.get(headerNameCandidate)
    } catch {
      continue
    }
    if (rawHeaderValue === null) {
      sawNullHeaderValue = true
      continue
    }
    const normalizedHeaderValue = normalizeHeaderValue(rawHeaderValue)
    if (normalizedHeaderValue !== undefined && normalizedHeaderValue !== null) {
      return normalizedHeaderValue
    }
  }

  return sawNullHeaderValue ? null : undefined
}

function resolveRequestIp(headers: Pick<Headers, "get">): string | null | undefined {
  const splitHeaderByDelimiter = (value: string, delimiter: string): string[] => {
    const segments: string[] = []
    let currentSegment = ""
    let activeQuote: "'" | '"' | null = null

    for (const character of value) {
      if ((character === "'" || character === '"') && (!activeQuote || activeQuote === character)) {
        activeQuote = activeQuote === character ? null : (character as "'" | '"')
        currentSegment += character
        continue
      }
      if (character === delimiter && activeQuote === null) {
        segments.push(currentSegment)
        currentSegment = ""
        continue
      }
      currentSegment += character
    }

    segments.push(currentSegment)
    return segments
  }

  const isValidIpv4Token = (candidate: string): boolean => {
    const segments = candidate.split(".")
    if (segments.length !== 4) {
      return false
    }
    for (const segment of segments) {
      if (!/^\d+$/.test(segment)) {
        return false
      }
      const numericSegment = Number(segment)
      if (numericSegment < 0 || numericSegment > 255) {
        return false
      }
    }
    return true
  }

  const isValidIpv6Token = (candidate: string): boolean => {
    if (!candidate.includes(":")) {
      return false
    }
    try {
      return new URL(`http://[${candidate}]`).hostname.length > 0
    } catch {
      return false
    }
  }

  const isValidIpAddressToken = (candidate: string): boolean => {
    return isValidIpv4Token(candidate) || isValidIpv6Token(candidate)
  }

  const isUnspecifiedIpAddressToken = (candidate: string): boolean => {
    if (candidate === "0.0.0.0") {
      return true
    }
    try {
      return new URL(`http://[${candidate}]`).hostname === "[::]"
    } catch {
      return false
    }
  }

  const isValidPortToken = (candidate: string): boolean => {
    if (!/^\d+$/.test(candidate)) {
      return false
    }
    const parsedPort = Number(candidate)
    return Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535
  }

  const isLikelyClientAddressToken = (candidate: string): boolean => {
    const normalizedCandidate = candidate.trim()
    if (normalizedCandidate.length === 0 || /\s/.test(normalizedCandidate)) {
      return false
    }
    if (
      normalizedCandidate === "[object Object]" ||
      normalizedCandidate === "[object Undefined]" ||
      normalizedCandidate === "[object Null]"
    ) {
      return false
    }
    const lowerCandidate = normalizedCandidate.toLowerCase()
    if (
      lowerCandidate === "unknown" ||
      lowerCandidate === "null" ||
      lowerCandidate === "undefined" ||
      lowerCandidate === "none" ||
      lowerCandidate === "nil" ||
      lowerCandidate === "n/a" ||
      lowerCandidate === "na" ||
      lowerCandidate === "-"
    ) {
      return false
    }
    if (normalizedCandidate.includes("://")) {
      return false
    }
    if (normalizedCandidate.includes("/") || normalizedCandidate.includes("\\")) {
      return false
    }
    if (!normalizedCandidate.includes(":") && /[a-z]/i.test(normalizedCandidate)) {
      return false
    }
    if (lowerCandidate.startsWith("function") || normalizedCandidate.includes("=>")) {
      return false
    }
    if (normalizedCandidate.includes("(") || normalizedCandidate.includes(")")) {
      return false
    }
    if (!isValidIpAddressToken(normalizedCandidate)) {
      return false
    }
    if (isUnspecifiedIpAddressToken(normalizedCandidate)) {
      return false
    }
    return true
  }

  const normalizeForwardedToken = (candidate: string): string | undefined => {
    const stripWrappingQuotes = (value: string): string => {
      let normalizedValue = value.trim()
      while (normalizedValue.length >= 2) {
        const firstCharacter = normalizedValue[0]
        const lastCharacter = normalizedValue[normalizedValue.length - 1]
        if (
          (firstCharacter === '"' && lastCharacter === '"') ||
          (firstCharacter === "'" && lastCharacter === "'")
        ) {
          const unwrappedValue = normalizedValue.slice(1, -1).trim()
          if (unwrappedValue === normalizedValue) {
            break
          }
          normalizedValue = unwrappedValue
          continue
        }
        break
      }
      return normalizedValue
    }

    const trimmedCandidate = candidate.trim()
    if (trimmedCandidate.length === 0) {
      return undefined
    }
    const withoutForPrefix = trimmedCandidate.replace(/^for\s*=\s*/i, "").trim()
    const unquotedCandidate = stripWrappingQuotes(withoutForPrefix)
    if (
      unquotedCandidate.length === 0 ||
      unquotedCandidate.toLowerCase() === "unknown" ||
      unquotedCandidate.startsWith("_")
    ) {
      return undefined
    }
    if (unquotedCandidate.includes("://")) {
      return undefined
    }
    const ipv6Match = unquotedCandidate.match(/^\[([^\]]+)\](?::(\d+))?$/)
    if (ipv6Match?.[1]) {
      const ipv6PortCandidate = ipv6Match[2]?.trim()
      if (ipv6PortCandidate && !isValidPortToken(ipv6PortCandidate)) {
        return undefined
      }
      const normalizedIpv6Candidate = ipv6Match[1]
      return isLikelyClientAddressToken(normalizedIpv6Candidate) ? normalizedIpv6Candidate : undefined
    }
    if (unquotedCandidate.includes(":") && (unquotedCandidate.match(/:/g) ?? []).length === 1) {
      const [hostPart, portPart] = unquotedCandidate.split(":")
      const normalizedPortPart = portPart?.trim() || ""
      if (!isValidPortToken(normalizedPortPart)) {
        return undefined
      }
      const normalizedHostPart = hostPart?.trim() || ""
      return isLikelyClientAddressToken(normalizedHostPart) ? normalizedHostPart : undefined
    }
    return isLikelyClientAddressToken(unquotedCandidate) ? unquotedCandidate : undefined
  }

  const normalizeIpCandidate = (candidate: string | null | undefined): string | null | undefined => {
    if (candidate === null || candidate === undefined) {
      return candidate
    }
    const normalizedCandidate = splitHeaderByDelimiter(candidate, ",")
      .map((part) => normalizeForwardedToken(part))
      .find((part) => typeof part === "string" && part.length > 0)
    return normalizedCandidate && normalizedCandidate.length > 0 ? normalizedCandidate : undefined
  }

  const parseForwardedHeaderCandidate = (candidate: string | null | undefined): string | null | undefined => {
    if (candidate === null || candidate === undefined) {
      return candidate
    }
    const segments = splitHeaderByDelimiter(candidate, ",")
    for (const segment of segments) {
      const parts = splitHeaderByDelimiter(segment, ";")
      for (const part of parts) {
        if (!/^for\s*=/i.test(part.trim())) {
          continue
        }
        const normalizedToken = normalizeForwardedToken(part)
        if (normalizedToken) {
          return normalizedToken
        }
      }
    }
    return undefined
  }

  const forwardedFor = safeGetHeader(headers, "x-forwarded-for")
  const normalizedForwardedFor = normalizeIpCandidate(forwardedFor)
  if (normalizedForwardedFor) {
    return normalizedForwardedFor
  }

  const forwardedClientIpRaw = safeGetHeader(headers, "x-forwarded-client-ip")
  const normalizedForwardedClientIp = normalizeIpCandidate(forwardedClientIpRaw)
  if (normalizedForwardedClientIp) {
    return normalizedForwardedClientIp
  }

  const originalForwardedForRaw = safeGetHeader(headers, "x-original-forwarded-for")
  const normalizedOriginalForwardedFor = normalizeIpCandidate(originalForwardedForRaw)
  if (normalizedOriginalForwardedFor) {
    return normalizedOriginalForwardedFor
  }

  const vercelForwardedForRaw = safeGetHeader(headers, "x-vercel-forwarded-for")
  const normalizedVercelForwardedFor = normalizeIpCandidate(vercelForwardedForRaw)
  if (normalizedVercelForwardedFor) {
    return normalizedVercelForwardedFor
  }

  const netlifyClientIpRaw = safeGetHeader(headers, "x-nf-client-connection-ip")
  const normalizedNetlifyClientIp = normalizeIpCandidate(netlifyClientIpRaw)
  if (normalizedNetlifyClientIp) {
    return normalizedNetlifyClientIp
  }

  const xForwardedRaw = safeGetHeader(headers, "x-forwarded")
  const parsedXForwarded = parseForwardedHeaderCandidate(xForwardedRaw)
  if (parsedXForwarded) {
    return parsedXForwarded
  }
  const normalizedXForwarded = normalizeIpCandidate(xForwardedRaw)
  if (normalizedXForwarded) {
    return normalizedXForwarded
  }

  const forwardedHeaderRaw = safeGetHeader(headers, "forwarded")
  const forwardedHeader = parseForwardedHeaderCandidate(forwardedHeaderRaw)
  if (forwardedHeader) {
    return forwardedHeader
  }

  const realIpRaw = safeGetHeader(headers, "x-real-ip")
  const normalizedRealIp = normalizeIpCandidate(realIpRaw)
  if (normalizedRealIp) {
    return normalizedRealIp
  }

  const cfConnectingIpRaw = safeGetHeader(headers, "cf-connecting-ip")
  const normalizedCfConnectingIp = normalizeIpCandidate(cfConnectingIpRaw)
  if (normalizedCfConnectingIp) {
    return normalizedCfConnectingIp
  }

  const cfConnectingIpv6Raw = safeGetHeader(headers, "cf-connecting-ipv6")
  const normalizedCfConnectingIpv6 = normalizeIpCandidate(cfConnectingIpv6Raw)
  if (normalizedCfConnectingIpv6) {
    return normalizedCfConnectingIpv6
  }

  const cloudfrontViewerAddressRaw = safeGetHeader(headers, "cloudfront-viewer-address")
  const normalizedCloudfrontViewerAddress = normalizeIpCandidate(cloudfrontViewerAddressRaw)
  if (normalizedCloudfrontViewerAddress) {
    return normalizedCloudfrontViewerAddress
  }

  const azureClientIpRaw = safeGetHeader(headers, "x-azure-clientip")
  const normalizedAzureClientIp = normalizeIpCandidate(azureClientIpRaw)
  if (normalizedAzureClientIp) {
    return normalizedAzureClientIp
  }

  const fastlyClientIpRaw = safeGetHeader(headers, "fastly-client-ip")
  const normalizedFastlyClientIp = normalizeIpCandidate(fastlyClientIpRaw)
  if (normalizedFastlyClientIp) {
    return normalizedFastlyClientIp
  }

  const flyClientIpRaw = safeGetHeader(headers, "fly-client-ip")
  const normalizedFlyClientIp = normalizeIpCandidate(flyClientIpRaw)
  if (normalizedFlyClientIp) {
    return normalizedFlyClientIp
  }

  const envoyExternalAddressRaw = safeGetHeader(headers, "x-envoy-external-address")
  const normalizedEnvoyExternalAddress = normalizeIpCandidate(envoyExternalAddressRaw)
  if (normalizedEnvoyExternalAddress) {
    return normalizedEnvoyExternalAddress
  }

  const trueClientIpRaw = safeGetHeader(headers, "true-client-ip")
  const normalizedTrueClientIp = normalizeIpCandidate(trueClientIpRaw)
  if (normalizedTrueClientIp) {
    return normalizedTrueClientIp
  }

  const xTrueClientIpRaw = safeGetHeader(headers, "x-true-client-ip")
  const normalizedXTrueClientIp = normalizeIpCandidate(xTrueClientIpRaw)
  if (normalizedXTrueClientIp) {
    return normalizedXTrueClientIp
  }

  const clusterClientIpRaw = safeGetHeader(headers, "x-cluster-client-ip")
  const normalizedClusterClientIp = normalizeIpCandidate(clusterClientIpRaw)
  if (normalizedClusterClientIp) {
    return normalizedClusterClientIp
  }

  const appEngineUserIpRaw = safeGetHeader(headers, "x-appengine-user-ip")
  const normalizedAppEngineUserIp = normalizeIpCandidate(appEngineUserIpRaw)
  if (normalizedAppEngineUserIp) {
    return normalizedAppEngineUserIp
  }

  const xClientIpCompactRaw = safeGetHeader(headers, "x-clientip")
  const normalizedXClientIpCompact = normalizeIpCandidate(xClientIpCompactRaw)
  if (normalizedXClientIpCompact) {
    return normalizedXClientIpCompact
  }

  const clientIpRaw = safeGetHeader(headers, "client-ip")
  const normalizedClientIp = normalizeIpCandidate(clientIpRaw)
  if (normalizedClientIp) {
    return normalizedClientIp
  }

  const xClientIpRaw = safeGetHeader(headers, "x-client-ip")
  const normalizedXClientIp = normalizeIpCandidate(xClientIpRaw)
  if (normalizedXClientIp) {
    return normalizedXClientIp
  }

  const xRemoteIpRaw = safeGetHeader(headers, "x-remote-ip")
  const normalizedXRemoteIp = normalizeIpCandidate(xRemoteIpRaw)
  if (normalizedXRemoteIp) {
    return normalizedXRemoteIp
  }

  const remoteAddrRaw = safeGetHeader(headers, "remote-addr")
  const normalizedRemoteAddr = normalizeIpCandidate(remoteAddrRaw)
  if (normalizedRemoteAddr) {
    return normalizedRemoteAddr
  }

  if (
    forwardedFor === null &&
    forwardedClientIpRaw === null &&
    originalForwardedForRaw === null &&
    vercelForwardedForRaw === null &&
    netlifyClientIpRaw === null &&
    xForwardedRaw === null &&
    forwardedHeaderRaw === null &&
    realIpRaw === null &&
    cfConnectingIpRaw === null &&
    cfConnectingIpv6Raw === null &&
    cloudfrontViewerAddressRaw === null &&
    azureClientIpRaw === null &&
    fastlyClientIpRaw === null &&
    flyClientIpRaw === null &&
    envoyExternalAddressRaw === null &&
    trueClientIpRaw === null &&
    xTrueClientIpRaw === null &&
    clusterClientIpRaw === null &&
    appEngineUserIpRaw === null &&
    xClientIpCompactRaw === null &&
    clientIpRaw === null &&
    xClientIpRaw === null &&
    xRemoteIpRaw === null &&
    remoteAddrRaw === null
  ) {
    return null
  }
  return undefined
}

type RequestLogger = {
  info: (payload: Record<string, unknown>) => void
  error: (payload: Record<string, unknown>) => void
}

const NOOP_REQUEST_LOGGER: RequestLogger = {
  info: () => undefined,
  error: () => undefined,
}

function resolveRequestLogger(context: { requestId?: string; ip?: string | null; route: string }): RequestLogger {
  try {
    const loggerCandidate = withRequest(context) as { info?: unknown; error?: unknown } | undefined
    if (!loggerCandidate || typeof loggerCandidate !== "object") {
      return NOOP_REQUEST_LOGGER
    }
    return {
      info: typeof loggerCandidate.info === "function" ? (loggerCandidate.info as RequestLogger["info"]) : NOOP_REQUEST_LOGGER.info,
      error:
        typeof loggerCandidate.error === "function"
          ? (loggerCandidate.error as RequestLogger["error"])
          : NOOP_REQUEST_LOGGER.error,
    }
  } catch {
    return NOOP_REQUEST_LOGGER
  }
}

function safeLog(logFn: ((payload: Record<string, unknown>) => void) | undefined, payload: Record<string, unknown>): void {
  if (typeof logFn !== "function") {
    return
  }
  try {
    logFn(payload)
  } catch {
    return
  }
}

function getNumericStatusCode(value: unknown): number | undefined {
  const resolvedValue = resolveCallableValue(value)
  if (typeof resolvedValue === "number" && Number.isInteger(resolvedValue)) {
    return resolvedValue
  }
  if (typeof resolvedValue === "string") {
    const parsed = Number(resolvedValue.trim())
    if (Number.isInteger(parsed)) {
      return parsed
    }
  }
  if (resolvedValue && (typeof resolvedValue === "object" || typeof resolvedValue === "function")) {
    try {
      const primitiveNumericValue = Number(resolvedValue)
      if (Number.isInteger(primitiveNumericValue)) {
        return primitiveNumericValue
      }
    } catch {
      // Continue to primitive string coercion fallback.
    }
    try {
      const primitiveStringValue = String(resolvedValue).trim()
      const parsed = Number(primitiveStringValue)
      if (Number.isInteger(parsed)) {
        return parsed
      }
    } catch {
      return undefined
    }
  }
  return undefined
}

function resolveSuccessStatusCode(result: unknown): number | undefined {
  if (!result || typeof result !== "object" || !("status" in (result as object))) {
    return undefined
  }
  const status = getNumericStatusCode((result as { status?: unknown }).status)
  if (!status || status < 100 || status > 599) {
    return undefined
  }
  return status
}

function resolveErrorStatusCode(err: unknown): number | undefined {
  const resolvedError = resolveCallableValue(err)
  if (!resolvedError || typeof resolvedError !== "object") {
    return undefined
  }
  const anyErr = resolvedError as {
    statusCode?: unknown
    status?: unknown
    response?: { statusCode?: unknown; status?: unknown }
    cause?: {
      statusCode?: unknown
      status?: unknown
      response?: { statusCode?: unknown; status?: unknown }
    }
  }
  const resolvedResponse = resolveCallableValue(anyErr.response)
  const resolvedCause = resolveCallableValue(anyErr.cause) as
    | { statusCode?: unknown; status?: unknown; response?: { statusCode?: unknown; status?: unknown } }
    | undefined
  const resolvedCauseResponse = resolveCallableValue(resolvedCause?.response)
  const statusCode =
    getNumericStatusCode(anyErr.statusCode) ??
    getNumericStatusCode(anyErr.status) ??
    getNumericStatusCode((resolvedResponse as { statusCode?: unknown })?.statusCode) ??
    getNumericStatusCode((resolvedResponse as { status?: unknown })?.status) ??
    getNumericStatusCode(resolvedCause?.statusCode) ??
    getNumericStatusCode(resolvedCause?.status) ??
    getNumericStatusCode((resolvedCauseResponse as { statusCode?: unknown })?.statusCode) ??
    getNumericStatusCode((resolvedCauseResponse as { status?: unknown })?.status)
  if (!statusCode || statusCode < 400 || statusCode > 599) {
    return undefined
  }
  return statusCode
}

function resolveErrorMessage(err: unknown): string | undefined {
  const resolvedErr = resolveCallableValue(err)
  const directErrorMessage =
    typeof resolvedErr === "string" ? normalizeTelemetryErrorMessage(resolvedErr) : undefined
  if (directErrorMessage) {
    return directErrorMessage
  }

  if (!resolvedErr || typeof resolvedErr !== "object") {
    return undefined
  }

  const anyErr = resolvedErr as {
    message?: unknown
    error?: unknown
    statusText?: unknown
    cause?: unknown
    response?: {
      statusText?: unknown
      data?: unknown
    }
  }

  const resolvedResponse = resolveCallableValue(anyErr.response) as { statusText?: unknown; data?: unknown } | undefined
  const resolvedCause = resolveCallableValue(anyErr.cause) as
    | string
    | {
        message?: unknown
        response?: {
          statusText?: unknown
          data?: unknown
        }
      }
    | undefined
  const resolvedCauseResponse =
    typeof resolvedCause === "object" && resolvedCause ? resolveCallableValue(resolvedCause.response) : undefined

  const resolveMessageCandidate = (candidate: unknown): string | undefined => {
    const resolvedCandidate = resolveCallableValue(candidate)
    if (typeof resolvedCandidate === "string") {
      return normalizeTelemetryErrorMessage(resolvedCandidate)
    }
    if (!resolvedCandidate || typeof resolvedCandidate !== "object") {
      return undefined
    }
    const nestedCandidates = [
      (resolvedCandidate as { message?: unknown }).message,
      (resolvedCandidate as { error?: unknown }).error,
      (resolvedCandidate as { detail?: unknown }).detail,
      (resolvedCandidate as { title?: unknown }).title,
    ]
    for (const nestedCandidate of nestedCandidates) {
      const resolvedNestedCandidate = resolveTelemetryStringValue(nestedCandidate)
      if (resolvedNestedCandidate) {
        return normalizeTelemetryErrorMessage(resolvedNestedCandidate)
      }
    }
    const fallbackCandidateMessage = resolveTelemetryStringValue(resolvedCandidate)
    if (fallbackCandidateMessage) {
      return normalizeTelemetryErrorMessage(fallbackCandidateMessage)
    }
    return undefined
  }

  const responseData = resolveCallableValue(resolvedResponse?.data)
  const causeResponseData =
    typeof resolvedCauseResponse === "object" && resolvedCauseResponse
      ? resolveCallableValue((resolvedCauseResponse as { data?: unknown }).data)
      : undefined
  const resolveCollectionMessage = (collection: unknown): string | undefined => {
    if (!Array.isArray(collection)) {
      return undefined
    }
    for (const item of collection) {
      const resolvedItemMessage = resolveTelemetryStringValue(item)
      if (resolvedItemMessage) {
        const normalizedItemMessage = normalizeTelemetryErrorMessage(resolvedItemMessage)
        if (normalizedItemMessage) {
          return normalizedItemMessage
        }
      }
      if (!item || typeof item !== "object") {
        continue
      }
      const nestedCandidates = [
        (item as { message?: unknown }).message,
        (item as { error?: unknown }).error,
        (item as { detail?: unknown }).detail,
        (item as { title?: unknown }).title,
      ]
      for (const nestedCandidate of nestedCandidates) {
        const resolvedNestedCandidate = resolveMessageCandidate(nestedCandidate)
        if (resolvedNestedCandidate) {
          return resolvedNestedCandidate
        }
      }
    }
    return undefined
  }

  const responseDataMessageCandidates = [
    typeof responseData === "string" ? responseData : undefined,
    typeof responseData === "object" && responseData ? (responseData as { message?: unknown }).message : undefined,
    typeof responseData === "object" && responseData ? (responseData as { error?: unknown }).error : undefined,
    typeof responseData === "object" && responseData ? (responseData as { detail?: unknown }).detail : undefined,
    typeof responseData === "object" && responseData ? (responseData as { data?: unknown }).data : undefined,
    typeof responseData === "object" && responseData ? (responseData as { reason?: unknown }).reason : undefined,
    typeof responseData === "object" && responseData
      ? resolveCollectionMessage((responseData as { errors?: unknown }).errors)
      : undefined,
    typeof responseData === "object" && responseData
      ? resolveCollectionMessage((responseData as { issues?: unknown }).issues)
      : undefined,
    typeof causeResponseData === "string" ? causeResponseData : undefined,
    typeof causeResponseData === "object" && causeResponseData
      ? (causeResponseData as { message?: unknown }).message
      : undefined,
    typeof causeResponseData === "object" && causeResponseData
      ? (causeResponseData as { error?: unknown }).error
      : undefined,
    typeof causeResponseData === "object" && causeResponseData
      ? (causeResponseData as { detail?: unknown }).detail
      : undefined,
    typeof causeResponseData === "object" && causeResponseData
      ? resolveCollectionMessage((causeResponseData as { errors?: unknown }).errors)
      : undefined,
    typeof causeResponseData === "object" && causeResponseData
      ? resolveCollectionMessage((causeResponseData as { issues?: unknown }).issues)
      : undefined,
  ]

  const messageCandidates = [
    ...responseDataMessageCandidates,
    anyErr.message,
    anyErr.error,
    typeof resolvedCause === "string" ? resolvedCause : undefined,
    typeof resolvedCause === "object" && resolvedCause ? resolvedCause.message : undefined,
    typeof resolvedCauseResponse === "object" && resolvedCauseResponse
      ? (resolvedCauseResponse as { statusText?: unknown }).statusText
      : undefined,
    resolvedResponse?.statusText,
    anyErr.statusText,
  ]

  for (const candidate of messageCandidates) {
    const resolvedCandidate = resolveMessageCandidate(candidate)
    if (resolvedCandidate) {
      return resolvedCandidate
    }
  }

  return undefined
}

function resolveRequestMethod(req: Request): string {
  const isValidHttpMethodToken = (value: string): boolean => {
    return /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,32}$/.test(value)
  }

  let method: unknown
  try {
    method = resolveCallableValue((req as { method?: unknown }).method)
  } catch {
    return "UNKNOWN"
  }
  if (typeof method === "string" && method.trim().length > 0) {
    const normalizedMethod = method.trim().toUpperCase()
    return isValidHttpMethodToken(normalizedMethod) ? normalizedMethod : "UNKNOWN"
  }
  if (!method || (typeof method !== "object" && typeof method !== "function")) {
    return "UNKNOWN"
  }
  try {
    const serializedMethod = String(method).trim()
    if (
      serializedMethod.length === 0 ||
      serializedMethod === "[object Object]" ||
      serializedMethod === "[object Undefined]" ||
      serializedMethod === "[object Null]"
    ) {
      return "UNKNOWN"
    }
    const normalizedMethod = serializedMethod.toUpperCase()
    return isValidHttpMethodToken(normalizedMethod) ? normalizedMethod : "UNKNOWN"
  } catch {
    return "UNKNOWN"
  }
}

function resolveRequestId(headers: Pick<Headers, "get">): string | undefined {
  const normalizeRequestIdCandidate = (candidate: string | null | undefined): string | undefined => {
    if (!candidate) {
      return undefined
    }

    const splitHeaderByDelimiter = (value: string, delimiter: string): string[] => {
      const segments: string[] = []
      let currentSegment = ""
      let activeQuote: "'" | '"' | null = null

      for (const character of value) {
        if ((character === "'" || character === '"') && (!activeQuote || activeQuote === character)) {
          activeQuote = activeQuote === character ? null : (character as "'" | '"')
          currentSegment += character
          continue
        }
        if (character === delimiter && activeQuote === null) {
          segments.push(currentSegment)
          currentSegment = ""
          continue
        }
        currentSegment += character
      }

      segments.push(currentSegment)
      return segments
    }

    const stripWrappingQuotes = (value: string): string => {
      let normalizedValue = value.trim()
      while (normalizedValue.length >= 2) {
        const firstCharacter = normalizedValue[0]
        const lastCharacter = normalizedValue[normalizedValue.length - 1]
        if (
          (firstCharacter === '"' && lastCharacter === '"') ||
          (firstCharacter === "'" && lastCharacter === "'")
        ) {
          const unwrappedValue = normalizedValue.slice(1, -1).trim()
          if (unwrappedValue === normalizedValue) {
            break
          }
          normalizedValue = unwrappedValue
          continue
        }
        break
      }
      return normalizedValue
    }

    const segments = splitHeaderByDelimiter(candidate, ",")
      .map((segment) => stripWrappingQuotes(segment))
      .filter((segment) => segment.length > 0)

    for (const segment of segments) {
      const lowerSegment = segment.toLowerCase()
      if (
        lowerSegment === "unknown" ||
        lowerSegment === "null" ||
        lowerSegment === "undefined" ||
        lowerSegment === "none" ||
        lowerSegment === "nil" ||
        lowerSegment === "n/a" ||
        lowerSegment === "na" ||
        lowerSegment === "-"
      ) {
        continue
      }
      if (
        segment === "[object Object]" ||
        segment === "[object Undefined]" ||
        segment === "[object Null]" ||
        lowerSegment.startsWith("function") ||
        segment.includes("=>")
      ) {
        continue
      }
      if (segment.includes(",") || /\s/.test(segment)) {
        continue
      }
      return segment
    }

    return undefined
  }

  const readRequestIdHeader = (headerName: string): string | undefined => {
    return normalizeRequestIdCandidate(safeGetHeader(headers, headerName))
  }

  const directRequestId = readRequestIdHeader("x-request-id")
  if (directRequestId) {
    return directRequestId
  }

  const compactRequestId = readRequestIdHeader("x-requestid")
  if (compactRequestId) {
    return compactRequestId
  }

  const canonicalRequestId = readRequestIdHeader("request-id")
  if (canonicalRequestId) {
    return canonicalRequestId
  }

  const compactCanonicalRequestId = readRequestIdHeader("requestid")
  if (compactCanonicalRequestId) {
    return compactCanonicalRequestId
  }

  const correlationRequestId = readRequestIdHeader("x-correlation-id")
  if (correlationRequestId) {
    return correlationRequestId
  }

  const compactCorrelationRequestId = readRequestIdHeader("x-correlationid")
  if (compactCorrelationRequestId) {
    return compactCorrelationRequestId
  }

  const canonicalCorrelationId = readRequestIdHeader("correlation-id")
  if (canonicalCorrelationId) {
    return canonicalCorrelationId
  }

  const azureArrLogId = readRequestIdHeader("x-arr-log-id")
  if (azureArrLogId) {
    return azureArrLogId
  }

  const azureRequestId = readRequestIdHeader("x-ms-request-id")
  if (azureRequestId) {
    return azureRequestId
  }

  const cloudTraceContext = readRequestIdHeader("x-cloud-trace-context")
  if (cloudTraceContext) {
    return cloudTraceContext
  }

  const cloudflareRayId = readRequestIdHeader("cf-ray")
  if (cloudflareRayId) {
    return cloudflareRayId
  }

  const cloudfrontRequestId = readRequestIdHeader("x-amz-cf-id")
  if (cloudfrontRequestId) {
    return cloudfrontRequestId
  }

  const amazonGatewayRequestId = readRequestIdHeader("x-amzn-requestid")
  if (amazonGatewayRequestId) {
    return amazonGatewayRequestId
  }

  const amazonTraceId = readRequestIdHeader("x-amzn-trace-id")
  if (amazonTraceId) {
    return amazonTraceId
  }

  const b3TraceId = readRequestIdHeader("x-b3-traceid")
  if (b3TraceId) {
    return b3TraceId
  }

  const datadogTraceId = readRequestIdHeader("x-datadog-trace-id")
  if (datadogTraceId) {
    return datadogTraceId
  }

  const genericTraceId = readRequestIdHeader("x-trace-id")
  if (genericTraceId) {
    return genericTraceId
  }

  const openTelemetrySpanContext = readRequestIdHeader("x-ot-span-context")
  if (openTelemetrySpanContext) {
    return openTelemetrySpanContext
  }

  const traceParent = readRequestIdHeader("traceparent")
  if (traceParent) {
    return traceParent
  }

  return undefined
}

export async function withApiTelemetry<T>(
  req: Request,
  config: ApiTelemetryConfig,
  handler: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = Date.now()
  const pathname = resolveRequestPathname(req)
  const headers = resolveRequestHeaders(req)
  const requestId = resolveRequestId(headers)

  const log = resolveRequestLogger({
    requestId,
    ip: resolveRequestIp(headers),
    route: pathname,
  })
  const method = resolveRequestMethod(req)

  safeLog(log.info, { event: "api_start", name: config.name, method, path: pathname })
  try {
    const result = await handler()
    const durationMs = Date.now() - start
    safeLog(log.info, {
      event: "api_success",
      name: config.name,
      durationMs,
      statusCode: resolveSuccessStatusCode(result),
    })
    return { result, durationMs }
  } catch (err: any) {
    const durationMs = Date.now() - start
    safeLog(log.error, {
      event: "api_error",
      name: config.name,
      durationMs,
      statusCode: resolveErrorStatusCode(err),
      errorName: err?.name,
      err: resolveErrorMessage(err),
      stack: err?.stack,
    })
    throw err
  }
}

