/**
 * File:        apps/backend/src/modules/saas-control-plane/services/saas-control-plane.service.ts
 * Module:      saas-control-plane
 * Purpose:     Platform-owner governance — tenant provisioning, suspension,
 *              impersonation, billing, and entitlement management.
 *
 * Exports:
 *   - SaasControlPlaneService.provisionTenant(dto) → TenantProvisioningEntity
 *   - SaasControlPlaneService.suspendTenant(tenantId, reason) → void
 *   - SaasControlPlaneService.impersonate(opts) → { token: string; auditId: string }
 *   - SaasControlPlaneService.upsertEntitlements(dto) → EntitlementPlanEntity
 *   - SaasControlPlaneService.createBillingPlaceholder(dto) → BillingInvoicePlaceholderEntity
 *   - SaasControlPlaneService.auditImpersonation(dto) → SupportImpersonationAuditEntity
 *   - SaasControlPlaneService.listProvisioning / listEntitlements / listBilling / listAudit
 *
 * Depends on:
 *   - RbacService        — seeds 3 default roles + 9 permissions on provision
 *   - TenantEntity repo  — reads and updates tenant status on suspension
 *   - RefreshTokenEntity — bulk-revokes all tokens on tenant suspension
 *   - JwtService         — mints 15-min impersonation JWT
 *   - AwsSesService      — sends welcome email on provision (graceful skip if not configured)
 *
 * Side-effects:
 *   - DB writes to tenant_provisioning_requests, tenants, role/permission tables
 *   - refresh_tokens updated on suspension (revokedAt set)
 *   - AWS SES email on successful provision
 *
 * Key invariants:
 *   - provisionTenant is idempotent via TenantProvisioningEntity.status; duplicates are noop
 *   - Impersonation tokens expire in 15 min — never stored; only the audit record persists
 *   - suspendTenant does NOT delete data — only sets status and revokes tokens
 *
 * Read order:
 *   1. provisionTenant() — complex; start here
 *   2. suspendTenant()
 *   3. impersonate()
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { AppError } from '../../../common/errors/app-error';
import { AppLoggerService } from '../../../shared/logger';
import { AwsSesService } from '../../../shared/aws/ses.service';
import { RbacService } from '../../rbac/rbac.service';
import { TenantEntity } from '../../tenancy/entities/tenant.entity';
import { RefreshTokenEntity } from '../../auth/entities/refresh-token.entity';
import {
  CreateBillingInvoicePlaceholderDto,
  CreateSupportImpersonationAuditDto,
  CreateTenantProvisioningDto,
  UpsertEntitlementPlanDto,
} from '../dtos/create-tenant-provisioning.dto';
import { BillingInvoicePlaceholderEntity } from '../entities/billing-invoice-placeholder.entity';
import { EntitlementPlanEntity } from '../entities/entitlement-plan.entity';
import { SupportImpersonationAuditEntity } from '../entities/support-impersonation-audit.entity';
import { TenantProvisioningEntity } from '../entities/tenant-provisioning.entity';
import { ROLE } from '../../rbac/constants/role.constants';
import { BROKER_DEFAULT_PERMS } from '../../rbac/constants/permission.constants';

const DEFAULT_ROLES = [ROLE.BROKER_ADMIN, 'trader', 'viewer'] as const;
const DEFAULT_PERMS = BROKER_DEFAULT_PERMS;

@Injectable()
export class SaasControlPlaneService {
  constructor(
    @InjectRepository(TenantProvisioningEntity)
    private readonly provisioningRepo: Repository<TenantProvisioningEntity>,
    @InjectRepository(EntitlementPlanEntity)
    private readonly entitlementRepo: Repository<EntitlementPlanEntity>,
    @InjectRepository(BillingInvoicePlaceholderEntity)
    private readonly billingRepo: Repository<BillingInvoicePlaceholderEntity>,
    @InjectRepository(SupportImpersonationAuditEntity)
    private readonly auditRepo: Repository<SupportImpersonationAuditEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenants: Repository<TenantEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly tokens: Repository<RefreshTokenEntity>,
    private readonly rbac: RbacService,
    private readonly jwt: JwtService,
    private readonly ses: AwsSesService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(SaasControlPlaneService.name);
  }

  /**
   * Full tenant provisioning:
   * 1. Look up tenant record (must exist — created separately via TenancyService)
   * 2. Seed default RBAC roles + permissions
   * 3. Send welcome email (graceful skip if SES not configured)
   * 4. Create provisioning record with status=COMPLETED
   */
  async provisionTenant(dto: CreateTenantProvisioningDto): Promise<TenantProvisioningEntity> {
    this.logger.debug('provisionTenant:start', { tenantId: dto.tenantId });

    const tenant = await this.tenants.findOne({ where: { id: dto.tenantId } });
    if (!tenant) throw new AppError('RESOURCE_NOT_FOUND', `Tenant ${dto.tenantId} not found`);

    const existing = await this.provisioningRepo.findOne({
      where: { tenantId: dto.tenantId, status: 'COMPLETED' },
    });
    if (existing) {
      this.logger.debug('provisionTenant: already completed', { tenantId: dto.tenantId });
      return existing;
    }

    const provisioning = await this.provisioningRepo.save(
      this.provisioningRepo.create({ ...dto, status: 'IN_PROGRESS' }),
    );

    await this.seedRbac(tenant.id);

    if (tenant.status === 'PENDING') {
      await this.tenants.update(tenant.id, { status: 'ACTIVE' });
    }

    const emailRecipient = dto.brokerAdminEmail ?? dto.requestedBy;
    await this.ses.sendEmail({
      to: emailRecipient,
      subject: `Welcome to Obsidian — ${tenant.displayName} is ready`,
      html: `<p>Your broker environment <strong>${tenant.displayName}</strong> has been provisioned. ` +
        `Login at <a href="https://${tenant.code}.obsidian.io/login">https://${tenant.code}.obsidian.io/login</a></p>`,
    });

    provisioning.status = 'COMPLETED';
    provisioning.resources = { ...provisioning.resources, ...dto.resources, rbacSeeded: true };
    const completed = await this.provisioningRepo.save(provisioning);
    this.logger.debug('provisionTenant:end', { provisioningId: completed.id });
    return completed;
  }

  /**
   * Suspend a tenant:
   * - Sets tenant.status = SUSPENDED
   * - Bulk-revokes all active refresh tokens (sets revokedAt)
   * All subsequent API calls will fail at the token validation step.
   */
  async suspendTenant(tenantId: string, reason?: string): Promise<void> {
    this.logger.debug('suspendTenant:start', { tenantId, reason });
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) throw new AppError('RESOURCE_NOT_FOUND', `Tenant ${tenantId} not found`);

    await this.tenants.update(tenantId, { status: 'SUSPENDED' });

    // Revoke all un-revoked refresh tokens for this tenant
    const activeTokens = await this.tokens.find({
      where: { tenantId: tenant.code, revokedAt: undefined as any },
    });
    const now = new Date();
    await Promise.all(
      activeTokens.map((t) => this.tokens.update(t.id, { revokedAt: now })),
    );

    this.logger.debug('suspendTenant:end', { tenantId, revokedTokens: activeTokens.length });
  }

  /**
   * Create a short-lived (15 min) impersonation JWT for platform-owner support.
   * The token carries `isImpersonation: true` so guards can flag every action
   * taken during the session in audit logs.
   */
  async impersonate(opts: {
    targetTenantId: string;
    adminUserId: string;
    reason: string;
  }): Promise<{ token: string; auditId: string }> {
    this.logger.debug('impersonate:start', opts);

    const tenant = await this.tenants.findOne({ where: { id: opts.targetTenantId } });
    if (!tenant) throw new AppError('RESOURCE_NOT_FOUND', `Tenant ${opts.targetTenantId} not found`);

    const token = this.jwt.sign(
      {
        sub: opts.adminUserId,
        tid: tenant.code,
        isImpersonation: true,
        reason: opts.reason,
      },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: '15m',
      },
    );

    const audit = await this.auditRepo.save(
      this.auditRepo.create({
        tenantId: opts.targetTenantId,
        actorUserId: opts.adminUserId,
        targetUserId: opts.adminUserId,
        reason: opts.reason,
        action: 'IMPERSONATE_START',
      }),
    );

    this.logger.debug('impersonate:end', { auditId: audit.id });
    return { token, auditId: audit.id };
  }

  async createProvisioning(dto: CreateTenantProvisioningDto): Promise<TenantProvisioningEntity> {
    this.logger.debug('createProvisioning:start', dto);
    const saved = await this.provisioningRepo.save(this.provisioningRepo.create(dto));
    this.logger.debug('createProvisioning:end', { provisioningId: saved.id });
    return saved;
  }

  async upsertEntitlements(dto: UpsertEntitlementPlanDto): Promise<EntitlementPlanEntity> {
    this.logger.debug('upsertEntitlements:start', dto);
    const existing = await this.entitlementRepo.findOne({ where: { tenantId: dto.tenantId } });
    const saved = await this.entitlementRepo.save(this.entitlementRepo.create({ ...(existing ?? {}), ...dto }));
    this.logger.debug('upsertEntitlements:end', { entitlementId: saved.id });
    return saved;
  }

  async createBillingPlaceholder(
    dto: CreateBillingInvoicePlaceholderDto,
  ): Promise<BillingInvoicePlaceholderEntity> {
    this.logger.debug('createBillingPlaceholder:start', dto);
    const saved = await this.billingRepo.save(this.billingRepo.create(dto));
    this.logger.debug('createBillingPlaceholder:end', { invoicePlaceholderId: saved.id });
    return saved;
  }

  async auditImpersonation(
    dto: CreateSupportImpersonationAuditDto,
  ): Promise<SupportImpersonationAuditEntity> {
    this.logger.debug('auditImpersonation:start', dto);
    const saved = await this.auditRepo.save(this.auditRepo.create(dto));
    this.logger.debug('auditImpersonation:end', { auditId: saved.id });
    return saved;
  }

  async listProvisioning(tenantId: string): Promise<TenantProvisioningEntity[]> {
    return this.provisioningRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async listEntitlements(tenantId: string): Promise<EntitlementPlanEntity[]> {
    return this.entitlementRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async listBilling(tenantId: string): Promise<BillingInvoicePlaceholderEntity[]> {
    return this.billingRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async listAudit(tenantId: string): Promise<SupportImpersonationAuditEntity[]> {
    return this.auditRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  private async seedRbac(tenantId: string): Promise<void> {
    for (const role of DEFAULT_ROLES) await this.rbac.ensureRole(tenantId, role);
    for (const perm of DEFAULT_PERMS) await this.rbac.ensurePermission(tenantId, perm);
    for (const perm of DEFAULT_PERMS) await this.rbac.grantPermissionToRole(tenantId, ROLE.BROKER_ADMIN, perm);
    this.logger.debug('seedRbac:done', { tenantId });
  }
}
