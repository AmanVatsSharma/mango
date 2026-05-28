/**
 * AWS S3 Service
 * 
 * Handles all S3 operations for image uploads:
 * - Profile images
 * - Payment QR codes
 * - Document uploads
 * - Image deletion
 * - Presigned URL generation
 * 
 * @module lib/aws-s3
 */

import { 
  S3Client, 
  PutObjectCommand, 
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

console.log("☁️ [AWS-S3] Module loading...")

/**
 * S3 Configuration Interface
 */
interface S3Config {
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

/**
 * Upload Options Interface
 */
interface UploadOptions {
  folder?: string // e.g., "profile-images", "qr-codes", "documents"
  fileName?: string // Custom file name (optional)
  contentType?: string // MIME type
  isPublic?: boolean // Make file publicly accessible
  metadata?: Record<string, string> // Custom metadata
}

/**
 * Upload Result Interface
 */
interface UploadResult {
  success: boolean
  url: string
  key: string
  bucket: string
  message?: string
}

/**
 * AWS S3 Service Class
 */
export class AWSS3Service {
  private s3Client: S3Client
  private bucket: string
  private region: string

  constructor(config?: S3Config) {
    console.log("🏗️ [AWS-S3] Initializing S3 service...")

    // Use provided config or environment variables
    this.region = config?.region || process.env.AWS_REGION || process.env.AWS_S3_REGION || 'us-east-1'
    this.bucket = config?.bucket || process.env.AWS_S3_BUCKET || ''
    
    const accessKeyId = config?.accessKeyId || process.env.AWS_ACCESS_KEY_ID || ''
    const secretAccessKey = config?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || ''

    // Validate configuration
    if (!this.bucket) {
      console.error("❌ [AWS-S3] S3 bucket not configured!")
      throw new Error("AWS_S3_BUCKET environment variable is required")
    }

    if (!accessKeyId || !secretAccessKey) {
      console.error("❌ [AWS-S3] AWS credentials not configured!")
      throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required")
    }

    // Initialize S3 client
    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    })

    console.log("✅ [AWS-S3] S3 service initialized successfully")
    console.log("📦 [AWS-S3] Bucket:", this.bucket)
    console.log("🌍 [AWS-S3] Region:", this.region)
  }

  /**
   * Upload file to S3
   * 
   * @param file - File buffer or stream
   * @param options - Upload options
   * @returns Upload result with URL and key
   */
  async uploadFile(
    file: Buffer | Uint8Array,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    console.log("📤 [AWS-S3] Uploading file to S3...")
    console.log("📋 [AWS-S3] Options:", options)

    try {
      // Generate unique file key
      const folder = options.folder || 'uploads'
      const timestamp = Date.now()
      const randomString = Math.random().toString(36).substring(2, 15)
      const fileName = options.fileName || `file-${timestamp}-${randomString}`
      const key = `${folder}/${fileName}`

      console.log("🔑 [AWS-S3] File key:", key)

      // Prepare upload command
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file,
        ContentType: options.contentType || 'application/octet-stream',
        ACL: options.isPublic ? 'public-read' : 'private',
        Metadata: {
          uploadedAt: new Date().toISOString(),
          ...options.metadata
        }
      })

      // Execute upload
      console.log("⬆️ [AWS-S3] Executing upload command...")
      await this.s3Client.send(command)

      // Generate public URL
      const url = options.isPublic
        ? `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`
        : await this.getPresignedUrl(key, 7 * 24 * 60 * 60) // 7 days expiry

      console.log("✅ [AWS-S3] File uploaded successfully!")
      console.log("🔗 [AWS-S3] URL:", url)

      return {
        success: true,
        url,
        key,
        bucket: this.bucket,
        message: "File uploaded successfully"
      }

    } catch (error: any) {
      console.error("❌ [AWS-S3] Upload failed:", error)
      console.error("🔍 [AWS-S3] Error details:", {
        message: error.message,
        code: error.code,
        statusCode: error.$metadata?.httpStatusCode
      })
      
      return {
        success: false,
        url: '',
        key: '',
        bucket: this.bucket,
        message: error.message || "Upload failed"
      }
    }
  }

  /**
   * Delete file from S3
   * 
   * @param key - S3 object key
   * @returns Success status
   */
  async deleteFile(key: string): Promise<boolean> {
    console.log("🗑️ [AWS-S3] Deleting file from S3...")
    console.log("🔑 [AWS-S3] Key:", key)

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      })

      await this.s3Client.send(command)
      
      console.log("✅ [AWS-S3] File deleted successfully!")
      return true

    } catch (error: any) {
      console.error("❌ [AWS-S3] Delete failed:", error)
      console.error("🔍 [AWS-S3] Error details:", error.message)
      return false
    }
  }

  /**
   * Generate presigned URL for private files
   * 
   * @param key - S3 object key
   * @param expiresIn - URL expiry in seconds (default: 1 hour)
   * @returns Presigned URL
   */
  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    console.log("🔗 [AWS-S3] Generating presigned URL...")
    console.log("🔑 [AWS-S3] Key:", key)
    console.log("⏱️ [AWS-S3] Expires in:", expiresIn, "seconds")

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      })

      const url = await getSignedUrl(this.s3Client, command, { expiresIn })
      
      console.log("✅ [AWS-S3] Presigned URL generated!")
      return url

    } catch (error: any) {
      console.error("❌ [AWS-S3] Presigned URL generation failed:", error)
      throw error
    }
  }

  /**
   * Check if file exists in S3
   * 
   * @param key - S3 object key
   * @returns True if file exists
   */
  async fileExists(key: string): Promise<boolean> {
    console.log("🔍 [AWS-S3] Checking if file exists...")
    console.log("🔑 [AWS-S3] Key:", key)

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      })

      await this.s3Client.send(command)
      
      console.log("✅ [AWS-S3] File exists!")
      return true

    } catch (error: any) {
      if (error.name === 'NotFound') {
        console.log("❌ [AWS-S3] File not found")
        return false
      }
      
      console.error("❌ [AWS-S3] Error checking file:", error)
      throw error
    }
  }

  /**
   * Get S3 bucket name
   */
  getBucket(): string {
    return this.bucket
  }

  /**
   * Get S3 region
   */
  getRegion(): string {
    return this.region
  }
}

/**
 * Create and export S3 service instance
 * Will be initialized when first imported
 */
let s3ServiceInstance: AWSS3Service | null = null

export function createS3Service(config?: S3Config): AWSS3Service {
  console.log("🏭 [AWS-S3] Creating S3 service instance...")
  
  if (!s3ServiceInstance) {
    s3ServiceInstance = new AWSS3Service(config)
  }
  
  return s3ServiceInstance
}

/**
 * Get existing S3 service instance
 * Throws error if not initialized
 */
export function getS3Service(): AWSS3Service {
  if (!s3ServiceInstance) {
    console.log("⚠️ [AWS-S3] S3 service not initialized, creating new instance...")
    s3ServiceInstance = new AWSS3Service()
  }
  
  return s3ServiceInstance
}

console.log("✅ [AWS-S3] Module loaded successfully")