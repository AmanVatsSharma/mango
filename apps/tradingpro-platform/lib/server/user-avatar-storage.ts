/**
 * @file user-avatar-storage.ts
 * @module server
 * @description Validate persisted user avatar URLs and best-effort S3 key extraction for uploads/avatars.
 * @author StockTrade
 * @created 2026-04-06
 */

import { getS3Service } from "@/lib/aws-s3"

export const USER_AVATAR_IMAGE_URL_MAX_LEN = 2048

export class UserAvatarValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "UserAvatarValidationError"
  }
}

function getBucketAndRegion(): { bucket: string; region: string } {
  const bucket = process.env.AWS_S3_BUCKET ?? ""
  const region = process.env.AWS_REGION || process.env.AWS_S3_REGION || "us-east-1"
  return { bucket, region }
}

/**
 * Returns true if url is safe to store on User.image (same-origin avatar path or our public S3 object under uploads/avatars/).
 */
export function isValidUserAvatarImageUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false
  if (url.length > USER_AVATAR_IMAGE_URL_MAX_LEN) return false
  const trimmed = url.trim()
  if (trimmed.startsWith("/uploads/avatars/")) return true

  const { bucket, region } = getBucketAndRegion()
  if (!bucket) return false
  const prefix = `https://${bucket}.s3.${region}.amazonaws.com/`
  if (!trimmed.startsWith(prefix)) return false
  const key = trimmed.slice(prefix.length).split("?")[0] ?? ""
  return key.startsWith("uploads/avatars/")
}

export function assertValidUserAvatarImageUrl(url: string): void {
  if (!isValidUserAvatarImageUrl(url)) {
    throw new UserAvatarValidationError(
      "INVALID_AVATAR_URL",
      "Avatar URL must be under /uploads/avatars/ or your configured public S3 bucket path uploads/avatars/"
    )
  }
}

/**
 * Parse S3 object key from a stored User.image URL for best-effort delete; only uploads/avatars/*.
 */
export function tryParseAvatarS3KeyFromImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl?.trim()) return null
  const trimmed = imageUrl.trim()
  const { bucket, region } = getBucketAndRegion()
  if (!bucket) return null
  const prefix = `https://${bucket}.s3.${region}.amazonaws.com/`
  if (!trimmed.startsWith(prefix)) return null
  const key = trimmed.slice(prefix.length).split("?")[0] ?? ""
  if (!key.startsWith("uploads/avatars/")) return null
  return key
}

export async function tryDeleteAvatarObjectOnS3(imageUrl: string | null | undefined): Promise<void> {
  const key = tryParseAvatarS3KeyFromImageUrl(imageUrl)
  if (!key) return
  try {
    let s3: ReturnType<typeof getS3Service>
    try {
      s3 = getS3Service()
    } catch {
      return
    }
    const ok = await s3.deleteFile(key)
    if (!ok) {
      console.warn("[user-avatar-storage] S3 avatar delete returned false", { key })
    }
  } catch (e) {
    console.warn("[user-avatar-storage] S3 avatar delete failed", {
      key,
      message: e instanceof Error ? e.message : String(e),
    })
  }
}
