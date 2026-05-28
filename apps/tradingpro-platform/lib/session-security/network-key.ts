/**
 * @file network-key.ts
 * @module session-security
 * @description Derive privacy-preserving fingerprints and network clustering keys from client IP.
 * @author StockTrade
 * @created 2026-03-28
 */

import { createHmac } from "crypto"
import type { NetworkClusterMode } from "./types"

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex")
}

export function fingerprintIp(ip: string, secret: string): string {
  const n = ip.trim().toLowerCase()
  if (n === "unknown" || n.length === 0) return hmac(secret, "unknown")
  return hmac(secret, n)
}

/** IPv4 subnet /24 base for clustering; IPv6 falls back to full normalized IP. */
export function subnetBaseForCluster(ip: string): string {
  const t = ip.trim()
  if (t.startsWith("::ffff:")) {
    const v4 = t.slice(7)
    const parts = v4.split(".")
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`
    return v4
  }
  const parts = t.split(".")
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`
  return t
}

export function computeNetworkKey(ip: string, mode: NetworkClusterMode, secret: string): string {
  if (ip === "unknown") return fingerprintIp("unknown", secret)
  if (mode === "SUBNET24") {
    const base = subnetBaseForCluster(ip)
    return fingerprintIp(`subnet24:${base}`, secret)
  }
  if (mode === "IP_HASH_WITH_ASN") {
    /** [SonuRamTODO] wire optional GeoIP/ASN provider */
    return fingerprintIp(ip, secret)
  }
  return fingerprintIp(ip, secret)
}

export function hashUserAgent(ua: string, secret: string): string {
  const slice = ua.length > 1024 ? ua.slice(0, 1024) : ua
  return hmac(secret, slice)
}

export function sessionSecuritySecret(): string {
  return process.env.NEXTAUTH_SECRET || process.env.SESSION_SECURITY_HMAC_SECRET || "dev-only-insecure"
}
