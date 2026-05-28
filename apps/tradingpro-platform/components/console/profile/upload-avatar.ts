/**
 * @file upload-avatar.ts
 * @module components/console/profile
 * @description Client upload for profile avatars via POST /api/upload (avatars folder + purpose).
 * @author StockTrade
 * @created 2026-04-06
 */

import { DEPOSIT_PROOF_MAX_BYTES } from "@/components/console/deposits/upload-deposit-proof"

function parseUploadResponse(res: Response, rawJson: unknown, bodyText: string): Record<string, unknown> {
  if (typeof rawJson === "object" && rawJson !== null && !Array.isArray(rawJson)) {
    return rawJson as Record<string, unknown>
  }
  if (bodyText.trim()) {
    return { error: bodyText.slice(0, 240) }
  }
  return {}
}

/**
 * POST multipart to `/api/upload` for avatar images.
 */
export async function uploadAvatarFile(file: File): Promise<{ url: string; key: string }> {
  if (file.size > DEPOSIT_PROOF_MAX_BYTES) {
    throw new Error(
      `Image must be under ${Math.round(DEPOSIT_PROOF_MAX_BYTES / (1024 * 1024))}MB.`
    )
  }

  const formData = new FormData()
  formData.append("file", file)
  formData.append("folder", "uploads/avatars")
  formData.append("purpose", "avatar")
  formData.append("isPublic", "true")

  let res: Response
  try {
    res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
      credentials: "same-origin",
    })
  } catch (e) {
    const isTypeErr = e instanceof TypeError
    throw new Error(
      isTypeErr
        ? "Network error while uploading. Check your connection or try a smaller image."
        : e instanceof Error
          ? e.message
          : "Upload failed"
    )
  }

  const ct = res.headers.get("content-type") || ""
  let rawJson: unknown = null
  let bodyText = ""
  if (ct.includes("application/json")) {
    try {
      rawJson = await res.json()
    } catch {
      rawJson = null
    }
  } else {
    bodyText = await res.text().catch(() => "")
  }

  const payload = parseUploadResponse(res, rawJson, bodyText)

  if (res.status === 413) {
    throw new Error("File too large for the server. Try a smaller image.")
  }

  if (!res.ok || payload.success !== true) {
    const msg =
      (typeof payload.error === "string" && payload.error.trim()) ||
      (typeof payload.message === "string" && payload.message.trim()) ||
      `Upload failed (${res.status})`
    throw new Error(msg)
  }

  const url = payload.url
  const key = payload.key
  if (typeof url !== "string" || typeof key !== "string") {
    throw new Error("Invalid upload response. Please try again.")
  }
  return { url, key }
}
