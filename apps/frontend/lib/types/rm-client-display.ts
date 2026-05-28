/**
 * @file rm-client-display.ts
 * @module types
 * @description Types and parsing for global RM client-display policy and per-RM public contact overrides.
 * @author StockTrade
 * @created 2026-03-27
 */

import type { Prisma } from "@prisma/client"

export type RmFieldMode = "REAL" | "HIDDEN" | "PLATFORM"

export type WhatsappDisplayMode = "INHERIT_PHONE" | "HIDDEN" | "PLATFORM" | "REAL"

export interface RmPublicContactV1 {
  displayName?: string | null
  email?: string | null
  phone?: string | null
  whatsappPhone?: string | null
  imageUrl?: string | null
}

export interface ClientRmFieldPolicy {
  mode: RmFieldMode
  platformValue?: string
}

export interface ClientRmDisplayPolicyV1 {
  version: 1
  card: "SHOW" | "HIDE"
  showRequestRmWhenUnassigned: boolean
  fields: {
    name: ClientRmFieldPolicy
    email: ClientRmFieldPolicy
    phone: ClientRmFieldPolicy
    image: ClientRmFieldPolicy
  }
  whatsapp: {
    mode: WhatsappDisplayMode
    platformValue?: string
  }
}

export interface ClientRmResolvedView {
  displayName: string | null
  email: string | null
  phone: string | null
  imageUrl: string | null
  whatsappPhone: string | null
}

export interface ClientRmApiResponse {
  showCard: boolean
  hasRM: boolean
  rm?: ClientRmResolvedView
}

export const DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1: ClientRmDisplayPolicyV1 = {
  version: 1,
  card: "SHOW",
  showRequestRmWhenUnassigned: true,
  fields: {
    name: { mode: "REAL" },
    email: { mode: "REAL" },
    phone: { mode: "REAL" },
    image: { mode: "REAL" },
  },
  whatsapp: { mode: "INHERIT_PHONE" },
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function parseFieldPolicy(raw: unknown, fallback: ClientRmFieldPolicy): ClientRmFieldPolicy {
  if (!isRecord(raw)) return fallback
  const mode = raw.mode
  if (mode !== "REAL" && mode !== "HIDDEN" && mode !== "PLATFORM") return fallback
  const platformValue =
    typeof raw.platformValue === "string" ? raw.platformValue : undefined
  return { mode, platformValue }
}

function parseWhatsapp(
  raw: unknown,
  fallback: ClientRmDisplayPolicyV1["whatsapp"]
): ClientRmDisplayPolicyV1["whatsapp"] {
  if (!isRecord(raw)) return fallback
  const mode = raw.mode
  if (
    mode !== "INHERIT_PHONE" &&
    mode !== "HIDDEN" &&
    mode !== "PLATFORM" &&
    mode !== "REAL"
  ) {
    return fallback
  }
  const platformValue =
    typeof raw.platformValue === "string" ? raw.platformValue : undefined
  return { mode: mode as WhatsappDisplayMode, platformValue }
}

/**
 * Normalizes stored JSON into a full v1 policy; invalid or missing input yields defaults (legacy behavior).
 */
export function parseClientRmDisplayPolicyJson(value: string | null | undefined): ClientRmDisplayPolicyV1 {
  if (!value || typeof value !== "string") {
    return { ...DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1, fields: { ...DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1.fields } }
  }
  try {
    const parsed = JSON.parse(value) as unknown
    if (!isRecord(parsed)) {
      return { ...DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1, fields: { ...DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1.fields } }
    }
    const card = parsed.card === "HIDE" ? "HIDE" : "SHOW"
    const showRequestRmWhenUnassigned =
      parsed.showRequestRmWhenUnassigned === false ? false : true
    const fieldsRaw = parsed.fields
    const fd = isRecord(fieldsRaw) ? fieldsRaw : {}
    return {
      version: 1,
      card,
      showRequestRmWhenUnassigned,
      fields: {
        name: parseFieldPolicy(fd.name, DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1.fields.name),
        email: parseFieldPolicy(fd.email, DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1.fields.email),
        phone: parseFieldPolicy(fd.phone, DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1.fields.phone),
        image: parseFieldPolicy(fd.image, DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1.fields.image),
      },
      whatsapp: parseWhatsapp(parsed.whatsapp, DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1.whatsapp),
    }
  } catch {
    return { ...DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1, fields: { ...DEFAULT_CLIENT_RM_DISPLAY_POLICY_V1.fields } }
  }
}

export function parseRmPublicContactJson(
  value: Prisma.JsonValue | null | undefined
): RmPublicContactV1 | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) return null
  const out: RmPublicContactV1 = {}
  if (typeof value.displayName === "string") out.displayName = value.displayName
  if (value.displayName === null) out.displayName = null
  if (typeof value.email === "string") out.email = value.email
  if (value.email === null) out.email = null
  if (typeof value.phone === "string") out.phone = value.phone
  if (value.phone === null) out.phone = null
  if (typeof value.whatsappPhone === "string") out.whatsappPhone = value.whatsappPhone
  if (value.whatsappPhone === null) out.whatsappPhone = null
  if (typeof value.imageUrl === "string") out.imageUrl = value.imageUrl
  if (value.imageUrl === null) out.imageUrl = null
  return Object.keys(out).length ? out : {}
}

function resolveScalarField(
  mode: RmFieldMode,
  platformValue: string | undefined,
  realValue: string | null | undefined
): string | null {
  if (mode === "HIDDEN") return null
  if (mode === "PLATFORM") {
    const v = (platformValue ?? "").trim()
    return v.length ? v : null
  }
  const r = realValue
  if (r === null || r === undefined) return null
  const t = String(r).trim()
  return t.length ? t : null
}

export interface ResolveClientRmViewInput {
  policy: ClientRmDisplayPolicyV1
  managedBy: {
    name: string | null
    email: string | null
    phone: string | null
    image: string | null
    rmPublicContact: Prisma.JsonValue | null
  } | null
}

/**
 * Builds the client-safe RM payload from policy, canonical RM fields, and optional rmPublicContact overrides.
 */
export function resolveClientRmView(input: ResolveClientRmViewInput): ClientRmApiResponse {
  const { policy, managedBy } = input
  const hasRM = Boolean(managedBy)

  if (policy.card === "HIDE") {
    return { showCard: false, hasRM }
  }

  if (!hasRM) {
    const showCard = policy.showRequestRmWhenUnassigned
    return { showCard, hasRM: false }
  }

  const override = parseRmPublicContactJson(managedBy!.rmPublicContact)
  const realName = override?.displayName ?? managedBy!.name
  const realEmail = override?.email ?? managedBy!.email
  const realPhone = override?.phone ?? managedBy!.phone
  const realImage = override?.imageUrl ?? managedBy!.image

  const displayName = resolveScalarField(
    policy.fields.name.mode,
    policy.fields.name.platformValue,
    realName
  )
  const email = resolveScalarField(
    policy.fields.email.mode,
    policy.fields.email.platformValue,
    realEmail
  )
  const phone = resolveScalarField(
    policy.fields.phone.mode,
    policy.fields.phone.platformValue,
    realPhone
  )
  const imageUrl = resolveScalarField(
    policy.fields.image.mode,
    policy.fields.image.platformValue,
    realImage
  )

  let whatsappPhone: string | null = null
  if (policy.whatsapp.mode === "HIDDEN") {
    whatsappPhone = null
  } else if (policy.whatsapp.mode === "PLATFORM") {
    const v = (policy.whatsapp.platformValue ?? "").trim()
    whatsappPhone = v.length ? v : null
  } else if (policy.whatsapp.mode === "INHERIT_PHONE") {
    whatsappPhone = phone
  } else {
    const wa = override?.whatsappPhone
    const fromReal = wa !== undefined && wa !== null ? String(wa).trim() : ""
    whatsappPhone = fromReal.length ? fromReal : phone
  }

  return {
    showCard: true,
    hasRM: true,
    rm: {
      displayName,
      email,
      phone,
      imageUrl,
      whatsappPhone,
    },
  }
}
