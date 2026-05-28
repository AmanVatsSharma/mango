/**
 * @file user-upload-policy.ts
 * @module server
 * @description Allowlisted user-upload folders, safe public path resolution, and upload purpose → S3 metadata module.
 * @author StockTrade
 * @created 2026-04-06
 */

import path from "path"

/** Folders permitted for POST /api/upload (exact match after trim). */
export const USER_UPLOAD_ALLOWED_FOLDERS = ["uploads/deposits", "uploads/avatars"] as const

export type UserUploadFolder = (typeof USER_UPLOAD_ALLOWED_FOLDERS)[number]

export function normalizeUserUploadFolder(raw: string | null | undefined): string {
  return (raw ?? "uploads/deposits").trim().replace(/^\/+/, "")
}

export function assertAllowedUserUploadFolder(folder: string): UserUploadFolder {
  const n = folder.replace(/^\/+/, "")
  if ((USER_UPLOAD_ALLOWED_FOLDERS as readonly string[]).includes(n)) {
    return n as UserUploadFolder
  }
  throw new UserUploadPolicyError("INVALID_FOLDER", "Upload folder is not allowed")
}

export class UserUploadPolicyError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "UserUploadPolicyError"
  }
}

/**
 * Resolve a directory under `public/` for local fallback; rejects path escape.
 */
export function resolveSafePublicUploadDir(relativeFolder: string): string {
  const publicRoot = path.resolve(process.cwd(), "public")
  const uploadDir = path.resolve(publicRoot, relativeFolder)
  const normalizedPublic = publicRoot.endsWith(path.sep) ? publicRoot : publicRoot + path.sep
  if (uploadDir !== publicRoot && !uploadDir.startsWith(normalizedPublic)) {
    throw new UserUploadPolicyError("INVALID_PATH", "Resolved upload path escapes public directory")
  }
  return uploadDir
}

export type UploadPurpose = "deposit" | "avatar"

export function parseUploadPurpose(raw: FormDataEntryValue | null): UploadPurpose {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : ""
  if (s === "avatar") return "avatar"
  return "deposit"
}

export function uploadModuleMetadata(purpose: UploadPurpose): string {
  return purpose === "avatar" ? "avatar" : "deposit-proof"
}
