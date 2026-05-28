/**
 * File:        apps/backend/src/modules/onboarding/services/kyc-document.service.ts
 * Module:      onboarding
 * Purpose:     KYC document lifecycle — upload to S3, human review state machine,
 *              aggregate status query, and outbox event emission on status change.
 *
 * Exports:
 *   - KycDocumentService.uploadDocument(opts) → KycDocumentEntity
 *   - KycDocumentService.reviewDocument(id, dto, reviewerId) → KycDocumentEntity
 *   - KycDocumentService.getStatus(tenantId, userId) → { overall, documents }
 *   - KycDocumentService.listByUser(tenantId, userId) → KycDocumentEntity[]
 *
 * Depends on:
 *   - OutboxService  — publishes kyc.status_changed events transactionally
 *   - S3Client       — file storage (graceful skip when AWS not configured)
 *
 * Side-effects:
 *   - S3 PutObject on upload (dev: skipped when AWS_ACCESS_KEY_ID absent)
 *   - OutboxEntity row written on review (triggers notification downstream)
 *
 * Key invariants:
 *   - State machine: PENDING_REVIEW → APPROVED | REJECTED only
 *   - s3Key format: `kyc/{tenantId}/{userId}/{id}/{filename}`
 *   - Overall KYC status: APPROVED if ≥1 identity doc approved; REJECTED if any rejected
 *
 * Read order:
 *   1. KycDocumentStatus — allowed state transitions
 *   2. uploadDocument() — entry point for new documents
 *   3. reviewDocument() — state machine transition + outbox emit
 *   4. getStatus()      — aggregate view
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { AppError } from '../../../common/errors/app-error';
import { AppLoggerService } from '../../../shared/logger';
import { OutboxService } from '../../../shared/outbox/outbox.service';
import { getRequestContext } from '../../../shared/request-context';
import { KycDocumentEntity, KycDocumentStatus, KycDocumentType } from '../entities/kyc-document.entity';
import { ReviewKycDocumentDto } from '../dtos/kyc-document.dto';
import { UsersService } from '../../users/users.service';

const IDENTITY_TYPES: KycDocumentType[] = ['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE'];

const ALLOWED_TRANSITIONS: Record<KycDocumentStatus, KycDocumentStatus[]> = {
  PENDING_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: ['PENDING_REVIEW'], // re-submission allowed
};

@Injectable()
export class KycDocumentService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    @InjectRepository(KycDocumentEntity)
    private readonly docs: Repository<KycDocumentEntity>,
    private readonly outbox: OutboxService,
    private readonly logger: AppLoggerService,
    private readonly users: UsersService,
  ) {
    this.logger.setContext(KycDocumentService.name);
    this.s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    this.bucket = process.env.KYC_S3_BUCKET || 'obsidian-kyc-dev';
  }

  async uploadDocument(opts: {
    tenantId: string;
    userId: string;
    documentType: KycDocumentType;
    fileBuffer: Buffer;
    originalFilename: string;
    mimeType: string;
  }): Promise<KycDocumentEntity> {
    this.logger.debug('uploadDocument:start', { userId: opts.userId, type: opts.documentType });

    const doc = this.docs.create({
      tenantId: opts.tenantId,
      userId: opts.userId,
      documentType: opts.documentType,
      s3Key: '',
      originalFilename: opts.originalFilename,
      mimeType: opts.mimeType,
      fileSizeBytes: opts.fileBuffer.length,
      status: 'PENDING_REVIEW',
    });
    const saved = await this.docs.save(doc);

    const s3Key = `kyc/${opts.tenantId}/${opts.userId}/${saved.id}/${opts.originalFilename}`;
    await this.putToS3(s3Key, opts.fileBuffer, opts.mimeType);

    saved.s3Key = s3Key;
    const final = await this.docs.save(saved);
    this.logger.debug('uploadDocument:end', { docId: final.id });
    return final;
  }

  async reviewDocument(
    id: string,
    dto: ReviewKycDocumentDto,
    reviewerId: string,
  ): Promise<KycDocumentEntity> {
    this.logger.debug('reviewDocument:start', { id, decision: dto.decision });
    const ctx = getRequestContext();

    const doc = await this.docs.findOne({ where: { id } });
    if (!doc) throw new AppError('RESOURCE_NOT_FOUND', `KYC document ${id} not found`);

    const allowed = ALLOWED_TRANSITIONS[doc.status];
    if (!allowed.includes(dto.decision as KycDocumentStatus)) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Cannot transition from ${doc.status} to ${dto.decision}`,
      );
    }

    doc.status = dto.decision as KycDocumentStatus;
    doc.reviewerId = reviewerId;
    doc.reviewedAt = new Date();
    doc.rejectionReason = dto.decision === 'REJECTED' ? (dto.rejectionReason ?? null) : null;

    const updated = await this.docs.save(doc);

    await this.outbox.append(
      'kyc.status_changed',
      {
        documentId: doc.id,
        userId: doc.userId,
        documentType: doc.documentType,
        status: doc.status,
        rejectionReason: doc.rejectionReason,
      },
      ctx?.tenantId ?? doc.tenantId,
    );

    this.logger.debug('reviewDocument:end', { docId: updated.id, status: updated.status });
    return updated;
  }

  async listByUser(tenantId: string, userId: string): Promise<KycDocumentEntity[]> {
    return this.docs.find({
      where: { tenantId, userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Admin: list all KYC documents across the tenant with optional status filter.
   * Ordered by creation date so newest pending items surface first.
   * Enriches each row with user metadata (name, email, countryCode) from UsersService.
   */
  async listAll(opts: {
    status?: KycDocumentStatus;
    userId?: string;
    documentType?: KycDocumentType;
    limit?: number;
    offset?: number;
  }) {
    const { status, userId, documentType, limit = 50, offset = 0 } = opts;
    const ctx = getRequestContext();
    this.logger.debug('listAll()', { ctx, opts });

    const where: any = { tenantId: ctx.tenantId };
    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (documentType) where.documentType = documentType;

    const [rows, total] = await Promise.all([
      this.docs.find({
        where,
        order: { createdAt: 'DESC' },
        take: limit,
        skip: offset,
      }),
      this.docs.count({ where }),
    ]);

    // Batch-fetch user metadata for all documents so frontend can display client names
    const userIds = [...new Set(rows.map(r => r.userId))];
    const userMap = new Map<string, { name?: string | null; email?: string | null; countryCode?: string | null }>();
    await Promise.all(
      userIds.map(uid =>
        this.users.findById(uid).then(u => {
          if (u) userMap.set(uid, { name: u.name, email: u.email, countryCode: u.countryCode });
        }),
      ),
    );

    const enriched = rows.map(doc => ({
      ...doc,
      userName: userMap.get(doc.userId)?.name ?? null,
      userEmail: userMap.get(doc.userId)?.email ?? null,
      userCountryCode: userMap.get(doc.userId)?.countryCode ?? null,
    }));

    return { data: enriched, total, limit, offset };
  }

  async getStatus(
    tenantId: string,
    userId: string,
  ): Promise<{ overall: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'; documents: KycDocumentEntity[] }> {
    const documents = await this.listByUser(tenantId, userId);

    const hasRejected = documents.some((d) => d.status === 'REJECTED');
    const hasApprovedIdentity = documents.some(
      (d) => IDENTITY_TYPES.includes(d.documentType) && d.status === 'APPROVED',
    );

    const overall: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' = hasRejected
      ? 'REJECTED'
      : hasApprovedIdentity
        ? 'APPROVED'
        : 'PENDING_REVIEW';

    return { overall, documents };
  }

  private async putToS3(key: string, body: Buffer, contentType: string): Promise<void> {
    const hasAwsCreds =
      !!process.env.AWS_ACCESS_KEY_ID ||
      !!process.env.AWS_PROFILE ||
      !!process.env.AWS_WEB_IDENTITY_TOKEN_FILE;

    if (!hasAwsCreds) {
      this.logger.warn(`[DEV-ONLY] AWS not configured. Skipping S3 upload for key: ${key}`);
      return;
    }

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
  }
}
