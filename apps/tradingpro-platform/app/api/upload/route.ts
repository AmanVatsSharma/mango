/**
 * @file app/api/upload/route.ts
 * @module api-upload
 * @description Authenticated multipart user uploads (deposits, avatars) to S3 with safe local fallback.
 * @author StockTrade
 * @created 2026-04-01
 * @updated 2026-04-06 — Folder allowlist, safe public paths, purpose metadata, isPublic only when not explicitly false.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { getS3Service } from '@/lib/aws-s3'
import {
  assertAllowedUserUploadFolder,
  normalizeUserUploadFolder,
  parseUploadPurpose,
  resolveSafePublicUploadDir,
  uploadModuleMetadata,
  UserUploadPolicyError,
} from '@/lib/server/user-upload-policy'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    let folder: string
    try {
      folder = assertAllowedUserUploadFolder(normalizeUserUploadFolder(formData.get('folder') as string))
    } catch (e) {
      if (e instanceof UserUploadPolicyError) {
        return NextResponse.json({ error: e.message }, { status: 400 })
      }
      throw e
    }

    const isPublic = formData.get('isPublic') !== 'false'
    const purpose = parseUploadPurpose(formData.get('purpose'))
    const moduleTag = uploadModuleMetadata(purpose)

    if (purpose === 'avatar' && folder !== 'uploads/avatars') {
      return NextResponse.json(
        { error: 'Avatar uploads must use folder uploads/avatars' },
        { status: 400 }
      )
    }

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, JPG, WEBP images are allowed.' },
        { status: 400 }
      )
    }

    const maxBytes = 4 * 1024 * 1024
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `File size too large. Maximum ${maxBytes / (1024 * 1024)}MB allowed.` },
        { status: 400 }
      )
    }

    try {
      const s3 = getS3Service()
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const uploadResult = await s3.uploadFile(buffer, {
        folder,
        fileName: `${session.user.id}_${Date.now()}_${file.name}`,
        contentType: file.type,
        isPublic,
        metadata: {
          uploadedBy: session.user.id!,
          source: 'user-upload',
          module: moduleTag,
        },
      })

      if (uploadResult.success) {
        console.log('✅ [UPLOAD] Uploaded to S3', { key: uploadResult.key, module: moduleTag })
        return NextResponse.json({
          success: true,
          url: uploadResult.url,
          key: uploadResult.key,
          bucket: uploadResult.bucket,
        })
      }

      console.warn('⚠️ [UPLOAD] S3 returned success=false, falling back to local:', uploadResult.message)
    } catch (s3Error: unknown) {
      console.warn(
        '⚠️ [UPLOAD] S3 unavailable or misconfigured, falling back to local:',
        s3Error instanceof Error ? s3Error.message : String(s3Error)
      )
    }

    let uploadDir: string
    try {
      uploadDir = resolveSafePublicUploadDir(folder)
    } catch (e) {
      if (e instanceof UserUploadPolicyError) {
        return NextResponse.json({ error: e.message }, { status: 400 })
      }
      throw e
    }

    try {
      await mkdir(uploadDir, { recursive: true })
    } catch {
      /* mkdir errors ignored — writeFile may still succeed */
    }

    const timestamp = Date.now()
    const ext = path.extname(file.name) || '.png'
    const filename = `${session.user.id}_${timestamp}${ext}`
    const filePath = path.join(uploadDir, filename)
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    const fileUrl = `/${folder}/${filename}`
    const localKey = `local:${folder}/${filename}`

    console.log('✅ [UPLOAD] Stored locally', { fileUrl, module: moduleTag })
    return NextResponse.json({ success: true, url: fileUrl, key: localKey })
  } catch (error) {
    console.error('❌ [UPLOAD] File upload error:', error)
    return NextResponse.json({ error: 'File upload failed' }, { status: 500 })
  }
}
