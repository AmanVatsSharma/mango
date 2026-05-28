/**
 * File:        apps/backend/src/shared/audit/audit.service.ts
 * Module:      shared/audit
 * Purpose:     Append-only audit trail with per-record HMAC-SHA256 signatures.
 *              Called from guards, services, and interceptors for every state-
 *              changing action that regulators or security teams need to verify.
 *
 * Exports:
 *   - AuditService.log(params) → AuditLogEntity  — appends one signed audit record
 *   - AuditService.query(params) → AuditLogEntity[] — paginated audit query
 *   - AuditService.verifyRecord(id) → boolean    — re-computes + compares HMAC
 *
 * Depends on:
 *   - AuditLogEntity — the table being written to
 *   - node:crypto    — HMAC computation (no external dep)
 *
 * Side-effects:
 *   - DB append (INSERT only — never UPDATE/DELETE)
 *
 * Key invariants:
 *   - HMAC secret: AUDIT_HMAC_SECRET env var, falls back to JWT_ACCESS_SECRET for dev
 *   - Signature input: `${tenantId}|${actorId}|${action}|${resourceId}|${timestamp}`
 *   - verifyRecord() returns false for any record where the signature doesn't match
 *
 * Read order:
 *   1. log()          — main entry point
 *   2. computeHmac()  — signing logic
 *   3. verifyRecord() — integrity check
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac } from 'node:crypto';
import { AppLoggerService } from '../logger';
import { getRequestContext } from '../request-context';
import { AuditLogEntity } from './audit-log.entity';

export interface AuditParams {
  tenantId?: string;
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ipAddress?: string;
}

export interface AuditQueryParams {
  tenantId: string;
  actorId?: string;
  action?: string;
  resourceType?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  private readonly hmacSecret: string;

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AuditService.name);
    this.hmacSecret =
      process.env.AUDIT_HMAC_SECRET || process.env.JWT_ACCESS_SECRET || 'dev-audit-secret';
  }

  async log(params: AuditParams): Promise<AuditLogEntity> {
    const ctx = getRequestContext();
    const tenantId = params.tenantId ?? ctx?.tenantId ?? 'unknown';
    const actorId = params.actorId ?? ctx?.userId ?? 'system';
    const requestId = ctx?.requestId ?? null;
    const timestamp = new Date().toISOString();

    const hmacSignature = this.computeHmac(tenantId, actorId, params.action, params.resourceId, timestamp);

    const record = this.repo.create({
      tenantId,
      actorId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      before: params.before ?? null,
      after: params.after ?? null,
      ipAddress: params.ipAddress ?? null,
      requestId,
      hmacSignature,
    });

    const saved = await this.repo.save(record);
    this.logger.debug('Audit log written', { id: saved.id, action: params.action });
    return saved;
  }

  async query(params: AuditQueryParams): Promise<AuditLogEntity[]> {
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.tenantId = :tenantId', { tenantId: params.tenantId });

    if (params.actorId) qb.andWhere('a.actorId = :actorId', { actorId: params.actorId });
    if (params.action) qb.andWhere('a.action = :action', { action: params.action });
    if (params.resourceType) qb.andWhere('a.resourceType = :rt', { rt: params.resourceType });
    if (params.from) qb.andWhere('a.createdAt >= :from', { from: params.from });
    if (params.to) qb.andWhere('a.createdAt <= :to', { to: params.to });

    return qb
      .orderBy('a.createdAt', 'DESC')
      .limit(params.limit ?? 100)
      .offset(params.offset ?? 0)
      .getMany();
  }

  async verifyRecord(id: string): Promise<boolean> {
    const record = await this.repo.findOne({ where: { id } });
    if (!record) return false;

    const expected = this.computeHmac(
      record.tenantId,
      record.actorId,
      record.action,
      record.resourceId,
      record.createdAt.toISOString(),
    );

    return expected === record.hmacSignature;
  }

  private computeHmac(
    tenantId: string,
    actorId: string,
    action: string,
    resourceId: string,
    timestamp: string,
  ): string {
    const payload = `${tenantId}|${actorId}|${action}|${resourceId}|${timestamp}`;
    return createHmac('sha256', this.hmacSecret).update(payload).digest('hex');
  }
}
