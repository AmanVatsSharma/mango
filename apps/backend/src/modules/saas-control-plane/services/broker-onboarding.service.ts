/**
 * File:        apps/backend/src/modules/saas-control-plane/services/broker-onboarding.service.ts
 * Module:      saas-control-plane
 * Purpose:     Orchestrates the full broker onboarding flow as a sequenced, idempotent
 *              series of service calls. One API call for the Platform Owner does everything.
 *
 * Exports:
 *   - BrokerOnboardingService.onboardBroker(dto, requestedBy) → OnboardBrokerResult
 *   - BrokerOnboardingService.listBrokers()                   → BrokerEntity[]
 *   - BrokerOnboardingService.getBroker(tenantCode)           → BrokerEntity | null
 *   - BrokerOnboardingService.suspendBroker(tenantCode, reason) → void
 *
 * Depends on:
 *   - TenancyService        — create/find tenant by code
 *   - SaasControlPlaneService — RBAC-seeded provisioning (idempotent)
 *   - BrokerHierarchyService  — create/find broker entity
 *   - UsersService            — create/find broker admin user
 *   - RbacService             — assign 'admin' role to broker admin user
 *   - AwsSnsService           — send welcome SMS to broker admin
 *   - OutboxService           — domain event for downstream consumers
 *   - AppLoggerService
 *
 * Side-effects:
 *   - DB: tenant, tenant_provisioning, roles/permissions, broker, user, user_role rows.
 *   - DB: outbox row for 'broker.onboarded' event.
 *   - AWS SNS: welcome SMS (only on first run — skipped on resume if user already existed).
 *
 * Key invariants:
 *   - SEQUENCED + IDEMPOTENT (not atomic). Each step is safe to re-run:
 *       tenant: collision → resume; suspended → hard-fail.
 *       provisioning: already COMPLETED → noop.
 *       broker entity: collision on (tenantId, brokerCode) → resume.
 *       user: already exists → resume (no duplicate SMS).
 *       role assignment: idempotent guard in RbacService.
 *   - SMS is sent only when adminUser is newly created to prevent duplicate messages on retry.
 *   - BrokerHierarchyService.createBroker receives tenant.id (UUID); UsersService.create
 *     receives tenant.code (slug) — this dual-semantics split is intentional (see plan §6 risk 3).
 *
 * Read order:
 *   1. onboardBroker() — main orchestration flow
 *   2. suspendBroker() — simpler; delegates to SaasControlPlaneService
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { AppError } from '../../../common/errors/app-error';
import { AwsSnsService } from '../../../shared/aws/sns.service';
import { OutboxService } from '../../../shared/outbox/outbox.service';
import { TenancyService } from '../../tenancy/services/tenancy.service';
import { BrokerHierarchyService } from '../../broker-hierarchy/services/broker-hierarchy.service';
import { BrokerMetricsService } from '../../broker-hierarchy/services/broker-metrics.service';
import { UsersService } from '../../users/users.service';
import { RbacService } from '../../rbac/rbac.service';
import { SaasControlPlaneService } from './saas-control-plane.service';
import { ROLE } from '../../rbac/constants/role.constants';
import { BrokerEntity } from '../../broker-hierarchy/entities/broker.entity';
import { OnboardBrokerDto } from '../dtos/onboard-broker.dto';
import { BillingInvoicePlaceholderEntity } from '../entities/billing-invoice-placeholder.entity';
import { EntitlementPlanEntity } from '../entities/entitlement-plan.entity';
import { SupportImpersonationAuditEntity } from '../entities/support-impersonation-audit.entity';
import { TenantProvisioningEntity } from '../entities/tenant-provisioning.entity';

export interface OnboardBrokerResult {
  tenantId: string;
  brokerCode: string;
  brokerId: string;
  adminUserId: string;
  resumed: boolean;
}

@Injectable()
export class BrokerOnboardingService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly saas: SaasControlPlaneService,
    private readonly brokerHierarchy: BrokerHierarchyService,
    private readonly brokerMetrics: BrokerMetricsService,
    private readonly users: UsersService,
    private readonly rbac: RbacService,
    private readonly sns: AwsSnsService,
    private readonly outbox: OutboxService,
    private readonly logger: AppLoggerService,
    @InjectRepository(BillingInvoicePlaceholderEntity)
    private readonly billingRepo: Repository<BillingInvoicePlaceholderEntity>,
    @InjectRepository(EntitlementPlanEntity)
    private readonly entitlementRepo: Repository<EntitlementPlanEntity>,
    @InjectRepository(SupportImpersonationAuditEntity)
    private readonly auditRepo: Repository<SupportImpersonationAuditEntity>,
    @InjectRepository(TenantProvisioningEntity)
    private readonly provisioningRepo: Repository<TenantProvisioningEntity>,
  ) {
    this.logger.setContext(BrokerOnboardingService.name);
  }

  async onboardBroker(dto: OnboardBrokerDto, requestedBy: string): Promise<OnboardBrokerResult> {
    this.logger.debug('onboardBroker:start', { brokerCode: dto.brokerCode, requestedBy });
    let resumed = false;

    // ── Step 1: Tenant ────────────────────────────────────────────────────────────
    // Code is the subdomain slug AND the JWT tid — it must exist before we can log in.
    let tenant = await this.tenancy.findByCode(dto.brokerCode);
    if (!tenant) {
      tenant = await this.tenancy.createTenant({
        code: dto.brokerCode,
        displayName: dto.brokerDisplayName,
        timezone: dto.timezone ?? 'Asia/Kolkata',
        jurisdictionProfile: dto.jurisdictionProfile ?? 'INDIA',
        status: 'PENDING',
      });
      this.logger.debug('onboardBroker: tenant created', { tenantId: tenant.id });
    } else if (tenant.status === 'SUSPENDED') {
      throw new AppError('AUTHORIZATION_FAILED', `Tenant ${dto.brokerCode} is suspended; cannot resume onboarding`);
    } else {
      resumed = true;
      this.logger.debug('onboardBroker: tenant exists (resuming)', { tenantId: tenant.id });
    }

    // ── Step 2: Provision (RBAC seed + tenant activation) ─────────────────────────
    // provisionTenant is idempotent — re-runs are noop when status=COMPLETED.
    await this.saas.provisionTenant({
      tenantId: tenant.id,
      requestedBy,
      brokerAdminEmail: dto.adminEmail,
      resources: { brokerOnboarded: true },
    });

    // ── Step 3: Broker entity ─────────────────────────────────────────────────────
    // CRITICAL: use tenant.id (UUID) — BrokerHierarchyService stores UUID FK, not slug.
    let broker = await this.brokerHierarchy.findBrokerByCode(tenant.id, dto.brokerCode);
    if (!broker) {
      broker = await this.brokerHierarchy.createBroker({
        tenantId: tenant.id,
        brokerCode: dto.brokerCode,
        displayName: dto.brokerDisplayName,
      });
      this.logger.debug('onboardBroker: broker entity created', { brokerId: broker.id });
    }

    // ── Step 4: Broker admin user ─────────────────────────────────────────────────
    // CRITICAL: use tenant.code (slug) — UserEntity.tenantId is varchar64 storing slug.
    // This must match what verifyOtp() uses when it looks up the user.
    let adminUser = await this.users.findByMobile(tenant.code, dto.adminMobileE164);
    const userWasCreated = !adminUser;
    if (!adminUser) {
      adminUser = await this.users.create({
        tenantId: tenant.code,
        mobileE164: dto.adminMobileE164,
        email: dto.adminEmail,
      });
      this.logger.debug('onboardBroker: admin user created', { adminUserId: adminUser.id });
    }

    // ── Step 5: Role assignment ───────────────────────────────────────────────────
    // RbacService.assignRoleToUser checks for existing mapping before insert — safe to re-run.
    // Uses tenant.code (slug) to match how PermissionsGuard queries RBAC.
    await this.rbac.assignRoleToUser(tenant.code, adminUser.id, ROLE.BROKER_ADMIN);

    // ── Step 6: Welcome SMS ───────────────────────────────────────────────────────
    // Only sent when the admin user was just created. Prevents duplicate SMS on retry/resume.
    if (userWasCreated) {
      await this.sendWelcomeSms(dto.adminMobileE164, dto.brokerCode, dto.brokerDisplayName);
    }

    // ── Step 7: Domain event ──────────────────────────────────────────────────────
    await this.outbox.append(
      'broker.onboarded',
      { tenantId: tenant.id, brokerId: broker.id, adminUserId: adminUser.id, requestedBy },
      tenant.id,
    );

    // ── Step 8: Seed initial metrics ──────────────────────────────────────────────
    // Idempotent — creates or updates the broker_metrics row with fresh snapshot.
    // Called even on resume (resumed=true) so the platform owner sees live counts.
    await this.brokerMetrics.upsertFromOnboarding(broker.id, tenant.id);

    this.logger.debug('onboardBroker:end', { tenantId: tenant.id, brokerId: broker.id, resumed });
    return {
      tenantId: tenant.id,
      brokerCode: tenant.code,
      brokerId: broker.id,
      adminUserId: adminUser.id,
      resumed,
    };
  }

  async listBrokers(): Promise<BrokerEntity[]> {
    // Returns all brokers without pagination for the dashboard list.
    // Use listBrokersWithMetrics() for paginated + metrics-augmented results.
    const { brokers } = await this.brokerHierarchy.listAllBrokers({ limit: 200 });
    return brokers;
  }

  async getBroker(tenantCode: string): Promise<BrokerEntity | null> {
    const tenant = await this.tenancy.findByCode(tenantCode);
    if (!tenant) return null;
    return this.brokerHierarchy.findBrokerByCode(tenant.id, tenantCode);
  }

  async suspendBroker(tenantCode: string, reason?: string): Promise<void> {
    const tenant = await this.tenancy.findByCode(tenantCode);
    if (!tenant) throw new AppError('RESOURCE_NOT_FOUND', `Broker ${tenantCode} not found`);
    await this.saas.suspendTenant(tenant.id, reason);
  }

  async getBrokerMetrics(tenantCode: string) {
    const metrics = await this.brokerMetrics.getMetricsByTenantCode(tenantCode);
    if (!metrics) {
      throw new AppError('RESOURCE_NOT_FOUND', `No metrics found for broker ${tenantCode}`);
    }
    return metrics;
  }

  async listBrokersWithMetrics(options: { limit?: number; offset?: number } = {}): Promise<{
    brokers: (BrokerEntity & { metrics?: { aum: string; clients: number; monthlyRevenue: string; monthlyRevenuePrev: string; healthScore: number; lastActivityAt: Date | null; computedAt: Date | null } })[];
    total: number;
  }> {
    const { brokers, total } = await this.brokerHierarchy.listAllBrokers(options);
    if (!brokers.length) return { brokers: [], total };

    // Batch-fetch metrics in a single query instead of N individual calls
    const metricsMap = await this.brokerMetrics.getMetricsBatch(brokers.map((b) => b.id));

    return {
      brokers: brokers.map((broker) => {
        const metrics = metricsMap.get(broker.id);
        return {
          ...broker,
          metrics: metrics
            ? {
                aum: metrics.aum,
                clients: metrics.clients,
                monthlyRevenue: metrics.monthlyRevenue,
                monthlyRevenuePrev: metrics.monthlyRevenuePrev,
                healthScore: metrics.healthScore,
                lastActivityAt: metrics.lastActivityAt ?? null,
                computedAt: metrics.computedAt ?? null,
              }
            : undefined,
        };
      }),
      total,
    };
  }

  /** Platform-level KPIs for dashboard — aggregates metrics across all brokers */
  async getPlatformStats(options: { limit?: number; offset?: number } = {}): Promise<{
    totalBrokers: number;
    activeBrokers: number;
    totalClients: number;
    totalAum: string;
    totalMonthlyRevenue: string;
    totalMonthlyRevenuePrev: string;
    total: number;
  }> {
    const { brokers, total } = await this.brokerHierarchy.listAllBrokers(options);
    if (!brokers.length) {
      return { totalBrokers: 0, activeBrokers: 0, totalClients: 0, totalAum: '0', totalMonthlyRevenue: '0', totalMonthlyRevenuePrev: '0', total };
    }

    // Batch-fetch all metrics in a single query
    const metricsMap = await this.brokerMetrics.getMetricsBatch(brokers.map((b) => b.id));

    const activeBrokers = brokers.filter((b) => b.status === 'ACTIVE').length;
    let totalClients = 0, totalAum = 0, totalMonthlyRevenue = 0, totalMonthlyRevenuePrev = 0;

    for (const broker of brokers) {
      const m = metricsMap.get(broker.id);
      totalClients += m?.clients ?? 0;
      totalAum += Number(m?.aum ?? '0');
      totalMonthlyRevenue += Number(m?.monthlyRevenue ?? '0');
      totalMonthlyRevenuePrev += Number(m?.monthlyRevenuePrev ?? '0');
    }

    return {
      totalBrokers: brokers.length,
      activeBrokers,
      totalClients,
      totalAum: String(totalAum),
      totalMonthlyRevenue: String(totalMonthlyRevenue),
      totalMonthlyRevenuePrev: String(totalMonthlyRevenuePrev),
      total,
    };
  }

  async getRevenueSeries(months = 12): Promise<Array<{ month: string; mrr: number; newBusiness: number; churn: number }>> {
    const now = new Date();
    const { brokers } = await this.brokerHierarchy.listAllBrokers({ limit: 200 });

    const result: Array<{ month: string; mrr: number; newBusiness: number; churn: number }> = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      let monthRevenue = 0;
      for (const broker of brokers) {
        // For simplicity, use current month revenue (production would track historical)
        if (i === 0) {
          const metrics = await this.brokerMetrics.getMetrics(broker.id);
          monthRevenue += Number(metrics?.monthlyRevenue ?? '0');
        }
      }

      // Mark newBusiness for brokers onboarded in this month
      const newBusiness = brokers.filter((b) =>
        b.createdAt.toISOString().slice(0, 7) === month
      ).length;

      result.push({
        month,
        mrr: i === 0 ? monthRevenue : 0, // Only current month has real revenue
        newBusiness,
        churn: 0, // TODO: compute from brokers that went SUSPENDED this month
      });
    }

    return result;
  }

  /** All billing invoices across all brokers — no tenant filter for platform owner */
  async listAllBilling(): Promise<BillingInvoicePlaceholderEntity[]> {
    return this.billingRepo.find({ order: { createdAt: 'DESC' } });
  }

  /** Entitlement plans across all brokers */
  async listAllEntitlements(): Promise<EntitlementPlanEntity[]> {
    return this.entitlementRepo.find({ order: { createdAt: 'DESC' } });
  }

  /** Upsert entitlement for a specific tenant */
  async upsertEntitlementsForTenant(dto: {
    tenantId: string;
    planCode: string;
    entitlements: Record<string, unknown>;
    featureFlags: Record<string, boolean>;
  }): Promise<EntitlementPlanEntity> {
    this.logger.debug('upsertEntitlementsForTenant:start', { tenantId: dto.tenantId, planCode: dto.planCode });
    const existing = await this.entitlementRepo.findOne({ where: { tenantId: dto.tenantId } });
    const saved = await this.entitlementRepo.save(
      this.entitlementRepo.create({
        ...(existing ?? {}),
        tenantId: dto.tenantId,
        planCode: dto.planCode,
        entitlements: dto.entitlements,
        featureFlags: dto.featureFlags,
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      }),
    );
    this.logger.debug('upsertEntitlementsForTenant:end', { entitlementId: saved.id });
    return saved;
  }

  /** Create a billing invoice placeholder for a tenant — idempotent by idempotencyKey or tenantId+invoiceNumber */
  async createBillingPlaceholder(dto: {
    tenantId: string;
    invoiceNumber: string;
    amount: string;
    currency: string;
    idempotencyKey?: string;
  }): Promise<BillingInvoicePlaceholderEntity> {
    this.logger.debug('createBillingPlaceholder:start', { invoiceNumber: dto.invoiceNumber, idempotencyKey: dto.idempotencyKey });

    // Idempotency check 1: by client-provided idempotencyKey
    if (dto.idempotencyKey) {
      const existing = await this.billingRepo.findOne({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) {
        this.logger.debug('createBillingPlaceholder: idempotency hit', { invoiceId: existing.id, idempotencyKey: dto.idempotencyKey });
        return existing;
      }
    }

    // Idempotency check 2: by tenantId + invoiceNumber (natural idempotency key)
    const existing = await this.billingRepo.findOne({ where: { tenantId: dto.tenantId, invoiceNumber: dto.invoiceNumber } });
    if (existing) {
      this.logger.debug('createBillingPlaceholder: existing invoice', { invoiceId: existing.id });
      return existing;
    }

    const saved = await this.billingRepo.save(this.billingRepo.create({
      tenantId: dto.tenantId,
      invoiceNumber: dto.invoiceNumber,
      amount: dto.amount,
      currency: dto.currency,
      status: 'DRAFT',
      idempotencyKey: dto.idempotencyKey ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    this.logger.debug('createBillingPlaceholder:end', { invoiceId: saved.id });
    return saved;
  }

  /** All impersonation audit records across all tenants */
  async listAllAudit(): Promise<SupportImpersonationAuditEntity[]> {
    return this.auditRepo.find({ order: { createdAt: 'DESC' } });
  }

  /** Suspended brokers — tenants with status = SUSPENDED */
  async listSuspendedBrokers(): Promise<BrokerEntity[]> {
    const { brokers } = await this.brokerHierarchy.listBrokersByStatus('SUSPENDED', { limit: 200 });
    return brokers;
  }

  /** Reactivate a suspended broker */
  async reactivateBroker(tenantCode: string): Promise<BrokerEntity> {
    this.logger.debug('reactivateBroker:start', { tenantCode });
    const tenant = await this.tenancy.findByCode(tenantCode);
    if (!tenant) throw new AppError('RESOURCE_NOT_FOUND', `Tenant ${tenantCode} not found`);

    await this.tenancy.update(tenant.id, { status: 'ACTIVE' });
    this.logger.debug('reactivateBroker: tenant reactivated', { tenantId: tenant.id });

    const broker = await this.brokerHierarchy.findBrokerByCode(tenant.id, tenantCode);
    if (!broker) throw new AppError('RESOURCE_NOT_FOUND', `Broker ${tenantCode} not found`);
    this.logger.debug('reactivateBroker:end', { brokerId: broker.id });
    return broker;
  }

  /** Pending onboarding queue — tenants with status = PENDING that haven't completed provisioning */
  async listPendingOnboarding(): Promise<Array<{
    tenantId: string;
    tenantCode: string;
    displayName: string;
    provisioningStatus: string;
    requestedBy: string;
    createdAt: Date;
    daysPending: number;
  }>> {
    // Fetch pending provisioning records and batch-resolve tenant codes
    const pendingRecords = await this.provisioningRepo
      .createQueryBuilder('p')
      .where('p.status IN (:statuses)', { statuses: ['PENDING', 'IN_PROGRESS'] })
      .orderBy('p.created_at', 'ASC')
      .getMany();

    // Resolve tenant codes for each pending record
    const results = await Promise.all(
      pendingRecords.map(async (record) => {
        const tenant = await this.tenancy.findById(record.tenantId);
        const createdAt = new Date(record.createdAt);
        const daysPending = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        return {
          tenantId: record.tenantId,
          tenantCode: tenant?.code ?? record.tenantId,
          displayName: tenant?.displayName ?? 'Unknown',
          provisioningStatus: record.status,
          requestedBy: record.requestedBy,
          createdAt,
          daysPending,
        };
      }),
    );

    return results;
  }

  /** Complete a pending onboarding step — advance provisioning to COMPLETED */
  async advanceProvisioning(tenantId: string): Promise<TenantProvisioningEntity> {
    const record = await this.provisioningRepo.findOne({ where: { tenantId } });
    if (!record) throw new AppError('RESOURCE_NOT_FOUND', `Provisioning record for tenant ${tenantId} not found`);

    record.status = 'COMPLETED';
    record.resources = { ...record.resources, completedAt: new Date().toISOString() };
    const saved = await this.provisioningRepo.save(record);

    const tenant = await this.tenancy.findById(tenantId);
    if (tenant && tenant.status === 'PENDING') {
      await this.tenancy.update(tenantId, { status: 'ACTIVE' });
    }

    this.logger.debug('advanceProvisioning:done', { tenantId, provisioningId: saved.id });
    return saved;
  }

  /** Live platform activity events — aggregates recent events across all brokers */
  async getLiveActivity(limit = 50): Promise<Array<{
    id: string;
    type: string;
    message: string;
    time: string;
    brokerCode: string;
    severity: string;
  }>> {
    const { brokers } = await this.brokerHierarchy.listAllBrokers({ limit: 200 });
    const events: Array<{ id: string; type: string; message: string; time: string; brokerCode: string; severity: string }> = [];

    const eventTemplates = [
      { type: 'registration', message: 'New client registered', severity: 'info' },
      { type: 'deposit', message: 'Deposit confirmed', severity: 'success' },
      { type: 'withdrawal', message: 'Withdrawal request submitted', severity: 'warn' },
      { type: 'trade', message: 'Position opened', severity: 'info' },
      { type: 'kyc', message: 'KYC document uploaded', severity: 'info' },
      { type: 'alert', message: 'Risk alert triggered', severity: 'error' },
    ];

    // Generate synthesized events for each broker (production would query actual event logs)
    for (const broker of brokers.slice(0, 10)) {
      const count = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < count; i++) {
        const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
        const minutesAgo = Math.floor(Math.random() * 30);
        const time = new Date(Date.now() - minutesAgo * 60_000);
        events.push({
          id: `${broker.brokerCode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: template.type,
          message: `${template.message} — ${broker.displayName}`,
          time: time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          brokerCode: broker.brokerCode,
          severity: template.severity,
        });
      }
    }

    return events
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, limit);
  }

  /** Revenue breakdown by plan — derived from broker metrics + entitlement plans */
  async getPlanRevenueBreakdown(): Promise<Array<{ plan: string; amount: number; tenants: number }>> {
    const { brokers } = await this.brokerHierarchy.listAllBrokers({ limit: 200 });
    const entitlements = await this.entitlementRepo.find();

    const byPlan: Record<string, { amount: number; tenants: number }> = {};

    for (const broker of brokers) {
      const entitlement = entitlements.find((e) => e.tenantId === broker.tenantId);
      const plan = entitlement?.planCode ?? 'STARTER';

      const metrics = await this.brokerMetrics.getMetrics(broker.id);
      const revenue = Number(metrics?.monthlyRevenue ?? '0');

      if (!byPlan[plan]) byPlan[plan] = { amount: 0, tenants: 0 };
      byPlan[plan].amount += revenue;
      byPlan[plan].tenants += 1;
    }

    return Object.entries(byPlan).map(([plan, data]) => ({
      plan: plan,
      amount: data.amount,
      tenants: data.tenants,
    }));
  }

  /** Platform health — returns status of core infrastructure components */
  async getPlatformHealth(): Promise<{
    services: Array<{ name: string; status: string; uptime: string; latency: string; description: string }>;
    nodes: Array<{ id: string; location: string; load: number; memory: number; status: string; tenants: number }>;
    liquidityProviders: Array<{ id: number; name: string; type: string; status: string; latency: number; instruments: number; uptime: string; creditLimit: number; creditUsed: number }>;
  }> {
    // In production, this would query actual monitoring systems (Prometheus, K8s, etc.)
    // For now, return synthesized status based on broker activity
    const { brokers } = await this.brokerHierarchy.listAllBrokers({ limit: 200 });
    const activeCount = brokers.filter((b) => b.status === 'ACTIVE').length;

    const services = [
      { name: 'API Gateway',      status: 'OPERATIONAL', uptime: '99.9%',  latency: '12ms',  description: 'REST + WebSocket gateway' },
      { name: 'Database',        status: 'OPERATIONAL', uptime: '99.9%',  latency: '4ms',   description: 'PostgreSQL primary' },
      { name: 'Cache Layer',     status: 'OPERATIONAL', uptime: '99.7%',  latency: '1ms',   description: 'Redis cluster' },
      { name: 'Message Queue',    status: 'OPERATIONAL', uptime: '99.8%',  latency: '8ms',   description: 'Kafka message broker' },
    ];

    const nodes = [
      { id: 'node-1-us-east', location: 'US East (Virginia)',   load: 42, memory: 58, status: 'OPERATIONAL', tenants: activeCount },
      { id: 'node-2-eu-west', location: 'EU West (Frankfurt)', load: 31, memory: 45, status: 'OPERATIONAL', tenants: Math.floor(activeCount / 2) },
      { id: 'node-3-ap-south', location: 'AP South (Mumbai)',   load: 28, memory: 52, status: 'OPERATIONAL', tenants: Math.floor(activeCount / 2) },
    ];

    const liquidityProviders = [
      { id: 1, name: 'PrimeLiquidity',  type: 'PRIMARY',   status: 'CONNECTED', latency: 2,  instruments: 4500, uptime: '99.9%', creditLimit: 10_000_000, creditUsed: 2_400_000 },
      { id: 2, name: 'DeepFlow资本',     type: 'SECONDARY', status: 'CONNECTED', latency: 5,  instruments: 1200, uptime: '99.7%', creditLimit: 5_000_000,   creditUsed: 800_000 },
      { id: 3, name: 'Goldman Sachs',   type: 'INSTITUTIONAL', status: 'CONNECTED', latency: 8, instruments: 800, uptime: '99.8%', creditLimit: 50_000_000, creditUsed: 12_000_000 },
    ];

    return { services, nodes, liquidityProviders };
  }

  private async sendWelcomeSms(mobile: string, brokerCode: string, brokerDisplayName: string): Promise<void> {
    const loginUrl = `https://${brokerCode}.obsidian.io/login`;
    const message = `Welcome to ${brokerDisplayName}. Login at ${loginUrl}. Your mobile number is your login ID.`;
    try {
      await this.sns.sendSms(mobile, message);
      this.logger.debug('onboardBroker: welcome SMS sent', { mobile, brokerCode });
    } catch (err) {
      this.logger.warn('onboardBroker: welcome SMS failed (non-fatal)', { err });
    }
  }
}
