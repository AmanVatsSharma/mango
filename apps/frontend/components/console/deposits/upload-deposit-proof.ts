/**
 * @file upload-deposit-proof.ts
 * @module components/console/deposits
 * @description Client upload for deposit payment screenshots: size limit aligned with common serverless caps, optional canvas compression, and clear errors for network/413/non-JSON.
 * @author StockTrade
 * @created 2026-04-01
 */

/** ~4MB cap — below typical 4.5MB serverless request limits; stays in sync with API route validation. */
export const DEPOSIT_PROOF_MAX_BYTES = 4 * 1024 * 1024

const COMPRESS_IF_LARGER_THAN_BYTES = 900 * 1024
const MAX_EDGE_PX = 2048
const JPEG_QUALITY = 0.82

async function maybeCompressForDepositProof(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file
  }
  if (file.size <= COMPRESS_IF_LARGER_THAN_BYTES) {
    return file
  }
  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    if (
      width <= MAX_EDGE_PX &&
      height <= MAX_EDGE_PX &&
      file.size <= DEPOSIT_PROOF_MAX_BYTES
    ) {
      bitmap.close()
      return file
    }
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height))
    const w = Math.round(width * scale)
    const h = Math.round(height * scale)
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY)
    })
    if (!blob) {
      return file
    }
    if (blob.size >= file.size && file.size <= DEPOSIT_PROOF_MAX_BYTES) {
      return file
    }
    const base = file.name.replace(/\.[^.]+$/, "") || "proof"
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" })
  } catch {
    return file
  }
}

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
 * POST multipart to `/api/upload` with deposit folder; throws Error with user-safe message.
 */
export async function uploadDepositProofFile(file: File): Promise<{ url: string; key: string }> {
  const prepared = await maybeCompressForDepositProof(file)
  if (prepared.size > DEPOSIT_PROOF_MAX_BYTES) {
    throw new Error(
      `Image must be under ${Math.round(DEPOSIT_PROOF_MAX_BYTES / (1024 * 1024))}MB. Try a smaller photo.`
    )
  }

  const formData = new FormData()
  formData.append("file", prepared)
  formData.append("folder", "uploads/deposits")
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
        ? "Network error while uploading. Check your connection, try a smaller image, or retry without attachment."
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
