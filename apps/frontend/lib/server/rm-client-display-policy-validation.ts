/**
 * @file rm-client-display-policy-validation.ts
 * @module server
 * @description Validates client RM display policy JSON before persisting to SystemSettings.
 * @author StockTrade
 * @created 2026-03-27
 */

import { AppError } from "@/src/common/errors"
import {
  type ClientRmFieldPolicy,
  parseClientRmDisplayPolicyJson,
  type RmFieldMode,
} from "@/lib/types/rm-client-display"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"

function needsPlatformValue(mode: RmFieldMode): boolean {
  return mode === "PLATFORM"
}

function collectPlatformErrors(label: string, fp: ClientRmFieldPolicy): string[] {
  if (needsPlatformValue(fp.mode)) {
    const v = (fp.platformValue ?? "").trim()
    if (!v) return [`${label}: platform value is required when mode is PLATFORM`]
  }
  return []
}

/**
 * Throws AppError 400 if policy JSON is invalid for save.
 */
export function assertValidClientRmDisplayPolicySettingValue(value: unknown): void {
  if (typeof value !== "string") {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "client_rm_display_policy_v1 must be a JSON string",
      statusCode: 400,
    })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "client_rm_display_policy_v1 must be valid JSON",
      statusCode: 400,
    })
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "client_rm_display_policy_v1 must be a JSON object",
      statusCode: 400,
    })
  }

  const policy = parseClientRmDisplayPolicyJson(value)
  const errors: string[] = []
  errors.push(...collectPlatformErrors("Name", policy.fields.name))
  errors.push(...collectPlatformErrors("Email", policy.fields.email))
  errors.push(...collectPlatformErrors("Phone", policy.fields.phone))
  errors.push(...collectPlatformErrors("Image URL", policy.fields.image))
  if (policy.whatsapp.mode === "PLATFORM") {
    const v = (policy.whatsapp.platformValue ?? "").trim()
    if (!v) errors.push("WhatsApp: platform value is required when mode is PLATFORM")
  }

  if (errors.length > 0) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: errors.join("; "),
      statusCode: 400,
    })
  }
}

export function isClientRmDisplayPolicyKey(key: string): boolean {
  return key === ADMIN_SETTING_KEYS.CLIENT_RM_DISPLAY_POLICY_V1
}
