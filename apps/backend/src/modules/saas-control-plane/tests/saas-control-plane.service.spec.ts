/**
 * @file src/modules/saas-control-plane/tests/saas-control-plane.service.spec.ts
 * @module saas-control-plane
 * @description Unit tests for SaaS control-plane service (provisioning, suspension, impersonation)
 * @author BharatERP
 * @created 2026-02-17
 * @last-updated 2026-04-24
 */

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { AwsSesService } from '../../../shared/aws/ses.service';
import { RbacService } from '../../rbac/rbac.service';
import { TenantEntity } from '../../tenancy/entities/tenant.entity';
import { RefreshTokenEntity } from '../../auth/entities/refresh-token.entity';
import { BillingInvoicePlaceholderEntity } from '../entities/billing-invoice-placeholder.entity';
import { EntitlementPlanEntity } from '../entities/entitlement-plan.entity';
import { SupportImpersonationAuditEntity } from '../entities/support-impersonation-audit.entity';
import { TenantProvisioningEntity } from '../entities/tenant-provisioning.entity';
import { SaasControlPlaneService } from '../services/saas-control-plane.service';

describe('SaasControlPlaneService', () => {
  let service: SaasControlPlaneService;
  const provisioningRepo = {
    save: jest.fn(), create: jest.fn(), find: jest.fn(), findOne: jest.fn(),
  };
  const entitlementRepo = { save: jest.fn(), create: jest.fn(), find: jest.fn(), findOne: jest.fn() };
  const billingRepo = { save: jest.fn(), create: jest.fn(), find: jest.fn() };
  const auditRepo = { save: jest.fn(), create: jest.fn(), find: jest.fn() };
  const tenantRepo = { findOne: jest.fn(), update: jest.fn() };
  const tokenRepo = { find: jest.fn(), update: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaasControlPlaneService,
        { provide: getRepositoryToken(TenantProvisioningEntity), useValue: provisioningRepo },
        { provide: getRepositoryToken(EntitlementPlanEntity), useValue: entitlementRepo },
        { provide: getRepositoryToken(BillingInvoicePlaceholderEntity), useValue: billingRepo },
        { provide: getRepositoryToken(SupportImpersonationAuditEntity), useValue: auditRepo },
        { provide: getRepositoryToken(TenantEntity), useValue: tenantRepo },
        { provide: getRepositoryToken(RefreshTokenEntity), useValue: tokenRepo },
        { provide: RbacService, useValue: { ensureRole: jest.fn(), ensurePermission: jest.fn(), grantPermissionToRole: jest.fn() } },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('mock.jwt.token') } },
        { provide: AwsSesService, useValue: { sendEmail: jest.fn().mockResolvedValue(undefined) } },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn(), error: jest.fn() } },
      ],
    }).compile();
    service = module.get<SaasControlPlaneService>(SaasControlPlaneService);
    jest.clearAllMocks();
  });

  it('creates tenant provisioning request (legacy)', async () => {
    provisioningRepo.create.mockReturnValue({});
    provisioningRepo.save.mockResolvedValue({ id: 'prov-1' });
    const result = await service.createProvisioning({
      tenantId: '31c7800e-aefc-4f91-a4df-0133f9d478ff',
      requestedBy: 'owner-1',
      resources: {},
    });
    expect(result.id).toBe('prov-1');
  });

  it('provisionTenant: seeds RBAC and activates tenant', async () => {
    const tenant = { id: 'tenant-1', code: 'acme', displayName: 'Acme FX', status: 'PENDING' };
    tenantRepo.findOne.mockResolvedValue(tenant);
    provisioningRepo.findOne.mockResolvedValue(null);
    provisioningRepo.create.mockImplementation((x: any) => x);
    provisioningRepo.save.mockImplementation(async (x: any) => ({ id: 'prov-2', ...x }));
    tenantRepo.update.mockResolvedValue(undefined);

    const result = await service.provisionTenant({
      tenantId: 'tenant-1',
      requestedBy: 'owner@acme.com',
      resources: {},
    });

    expect(result.status).toBe('COMPLETED');
    expect(tenantRepo.update).toHaveBeenCalledWith('tenant-1', { status: 'ACTIVE' });
  });

  it('suspendTenant: revokes all refresh tokens', async () => {
    tenantRepo.findOne.mockResolvedValue({ id: 'tenant-1', code: 'acme', status: 'ACTIVE' });
    tenantRepo.update.mockResolvedValue(undefined);
    tokenRepo.find.mockResolvedValue([{ id: 'tok-1' }, { id: 'tok-2' }]);
    tokenRepo.update.mockResolvedValue(undefined);

    await service.suspendTenant('tenant-1');

    expect(tenantRepo.update).toHaveBeenCalledWith('tenant-1', { status: 'SUSPENDED' });
    expect(tokenRepo.update).toHaveBeenCalledTimes(2);
  });

  it('impersonate: returns JWT token and audit id', async () => {
    tenantRepo.findOne.mockResolvedValue({ id: 'tenant-1', code: 'acme' });
    auditRepo.create.mockImplementation((x: any) => x);
    auditRepo.save.mockResolvedValue({ id: 'audit-1' });

    const result = await service.impersonate({
      targetTenantId: 'tenant-1',
      adminUserId: 'admin-1',
      reason: 'Support request SR-123',
    });

    expect(result.token).toBe('mock.jwt.token');
    expect(result.auditId).toBe('audit-1');
  });
});
