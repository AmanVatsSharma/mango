/**
 * File:        apps/backend/src/modules/tenancy/services/tenancy.service.ts
 * Module:      tenancy
 * Purpose:     Business service for tenant lifecycle, legal-entity, and brand config.
 *
 * Exports:
 *   - TenancyService.createTenant(dto) → TenantEntity
 *   - TenancyService.listTenants() → TenantEntity[]
 *   - TenancyService.createLegalEntity(dto) → LegalEntityEntity
 *   - TenancyService.listLegalEntities(tenantId?) → LegalEntityEntity[]
 *   - TenancyService.getBrandConfig(slugOrDomain) → TenantBrandConfigEntity | null
 *   - TenancyService.upsertBrandConfig(tenantId, dto) → TenantBrandConfigEntity
 *   - TenancyService.listDomains(tenantId) → TenantDomainEntity[]
 *   - TenancyService.addDomain(tenantId, domain) → TenantDomainEntity
 *   - TenancyService.removeDomain(domainId) → void
 *   - TenancyService.setPrimaryDomain(domainId, tenantId) → TenantDomainEntity
 *   - TenancyService.verifyDomainDns(domain) → { verified, recordType, expectedValue }
 *   - TenancyService.getDomainSslStatus(domain) → { active, expiry, issuer }
 *
 * Depends on:
 *   - TenantBrandConfigEntity — brand config table
 *
 * Side-effects: DB writes
 * Key invariants:
 *   - getBrandConfig resolves by tenant.code (slug) first, then brandConfig.customDomain
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { AppLoggerService } from '../../../shared/logger';
import { CreateLegalEntityDto } from '../dtos/create-legal-entity.dto';
import { CreateTenantDto } from '../dtos/create-tenant.dto';
import { UpsertBrandConfigDto } from '../dtos/upsert-brand-config.dto';
import { LegalEntityEntity } from '../entities/legal-entity.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { TenantBrandConfigEntity } from '../entities/tenant-brand-config.entity';
import { TenantDomainEntity } from '../entities/tenant-domain.entity';

@Injectable()
export class TenancyService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenants: Repository<TenantEntity>,
    @InjectRepository(LegalEntityEntity)
    private readonly legalEntities: Repository<LegalEntityEntity>,
    @InjectRepository(TenantBrandConfigEntity)
    private readonly brandConfigs: Repository<TenantBrandConfigEntity>,
    @InjectRepository(TenantDomainEntity)
    private readonly domains: Repository<TenantDomainEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(TenancyService.name);
  }

  async createTenant(dto: CreateTenantDto): Promise<TenantEntity> {
    this.logger.debug('createTenant:start', dto);
    const existing = await this.tenants.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new AppError('DUPLICATE_RESOURCE', `Tenant code ${dto.code} already exists`);
    }

    const entity = this.tenants.create({
      code: dto.code,
      displayName: dto.displayName,
      timezone: dto.timezone ?? 'UTC',
      jurisdictionProfile: dto.jurisdictionProfile ?? 'GLOBAL',
      status: dto.status ?? 'PENDING',
    });
    const saved = await this.tenants.save(entity);
    this.logger.debug('createTenant:end', { tenantId: saved.id });
    return saved;
  }

  async listTenants(): Promise<TenantEntity[]> {
    this.logger.debug('listTenants:start');
    const items = await this.tenants.find({ order: { createdAt: 'DESC' } });
    this.logger.debug('listTenants:end', { count: items.length });
    return items;
  }

  async createLegalEntity(dto: CreateLegalEntityDto): Promise<LegalEntityEntity> {
    this.logger.debug('createLegalEntity:start', dto);
    const tenant = await this.tenants.findOne({ where: { id: dto.tenantId } });
    if (!tenant) {
      throw new AppError('RESOURCE_NOT_FOUND', `Tenant ${dto.tenantId} not found`);
    }

    const entity = this.legalEntities.create(dto);
    const saved = await this.legalEntities.save(entity);
    this.logger.debug('createLegalEntity:end', { legalEntityId: saved.id });
    return saved;
  }

  async listLegalEntities(tenantId?: string): Promise<LegalEntityEntity[]> {
    this.logger.debug('listLegalEntities:start', { tenantId });
    const items = await this.legalEntities.find({
      where: tenantId ? { tenantId } : {},
      order: { createdAt: 'DESC' },
    });
    this.logger.debug('listLegalEntities:end', { count: items.length });
    return items;
  }

  async findByCode(code: string): Promise<TenantEntity | null> {
    return this.tenants.findOne({ where: { code } });
  }

  async findById(id: string): Promise<TenantEntity | null> {
    return this.tenants.findOne({ where: { id } });
  }

  async update(id: string, attrs: Partial<Pick<TenantEntity, 'status' | 'displayName'>>): Promise<void> {
    await this.tenants.update(id, attrs);
  }

  async getBrandConfig(slugOrDomain: string): Promise<TenantBrandConfigEntity | null> {
    this.logger.debug('getBrandConfig:start', { slugOrDomain });
    const tenant = await this.tenants.findOne({ where: { code: slugOrDomain } });
    if (tenant) {
      return this.brandConfigs.findOne({ where: { tenantId: tenant.id } });
    }
    return this.brandConfigs.findOne({ where: { customDomain: slugOrDomain } });
  }

  /**
   * Returns the brand config for a given tenantId.
   * Used by admin endpoints to fetch brand config by tenantId rather than slug.
   */
  async getBrandConfigByTenantId(tenantId: string): Promise<TenantBrandConfigEntity | null> {
    this.logger.debug('getBrandConfigByTenantId:start', { tenantId });
    return this.brandConfigs.findOne({ where: { tenantId } });
  }

  async upsertBrandConfig(tenantId: string, dto: UpsertBrandConfigDto): Promise<TenantBrandConfigEntity> {
    this.logger.debug('upsertBrandConfig:start', { tenantId });
    const existing = await this.brandConfigs.findOne({ where: { tenantId } });
    const merged = this.brandConfigs.create({
      ...(existing ?? {}),
      tenantId,
      ...dto,
      features: { ...(existing?.features ?? {}), ...(dto.features ?? {}) },
    });
    const saved = await this.brandConfigs.save(merged);
    this.logger.debug('upsertBrandConfig:end', { tenantId });
    return saved;
  }

  async listDomains(tenantId: string): Promise<TenantDomainEntity[]> {
    this.logger.debug('listDomains:start', { tenantId });
    const items = await this.domains.find({
      where: { tenantId },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
    this.logger.debug('listDomains:end', { count: items.length });
    return items;
  }

  async addDomain(tenantId: string, domain: string): Promise<TenantDomainEntity> {
    this.logger.debug('addDomain:start', { tenantId, domain });
    const existing = await this.domains.findOne({ where: { tenantId, domain } });
    if (existing) {
      throw new AppError('DUPLICATE_RESOURCE', `Domain '${domain}' is already registered for this tenant`);
    }
    const entity = this.domains.create({ tenantId, domain, isPrimary: false });
    const saved = await this.domains.save(entity);
    this.logger.debug('addDomain:end', { domainId: saved.id });
    return saved;
  }

  async removeDomain(domainId: string): Promise<void> {
    this.logger.debug('removeDomain:start', { domainId });
    const domain = await this.domains.findOne({ where: { id: domainId } });
    if (!domain) {
      throw new AppError('RESOURCE_NOT_FOUND', `Domain '${domainId}' not found`);
    }
    await this.domains.remove(domain);
    this.logger.debug('removeDomain:end', { domainId });
  }

  async setPrimaryDomain(domainId: string, tenantId: string): Promise<TenantDomainEntity> {
    this.logger.debug('setPrimaryDomain:start', { domainId, tenantId });
    const target = await this.domains.findOne({ where: { id: domainId } });
    if (!target) {
      throw new AppError('RESOURCE_NOT_FOUND', `Domain '${domainId}' not found`);
    }
    if (target.tenantId !== tenantId) {
      throw new AppError('AUTHORIZATION_FAILED', 'Domain does not belong to this tenant');
    }
    // Demote all existing primaries for this tenant
    await this.domains.update({ tenantId, isPrimary: true }, { isPrimary: false });
    target.isPrimary = true;
    const saved = await this.domains.save(target);
    this.logger.debug('setPrimaryDomain:end', { domainId });
    return saved;
  }

  /**
   * Simulated DNS verification check.
   * In production this would perform a real DNS lookup against the domain's nameservers.
   */
  async verifyDomainDns(domain: string): Promise<{ verified: boolean; recordType: string; expectedValue: string }> {
    this.logger.debug('verifyDomainDns:start', { domain });
    // Simulated: check if the domain record matches the expected CNAME pattern.
    const expectedValue = `_obsidian.${domain}`;
    const found = await this.domains.findOne({ where: { domain } });
    const verified = found?.dnsVerifiedAt != null;
    this.logger.debug('verifyDomainDns:end', { domain, verified });
    return { verified, recordType: 'CNAME', expectedValue };
  }

  /**
   * Simulated SSL status check for a given domain.
   * In production this would query LetsEncrypt / ACME provider or a CDN edge API.
   */
  async getDomainSslStatus(domain: string): Promise<{ active: boolean; expiry: string | null; issuer: string | null }> {
    this.logger.debug('getDomainSslStatus:start', { domain });
    const found = await this.domains.findOne({ where: { domain } });
    const active = found?.sslActive ?? false;
    // Simulated values — in production derive from ACME / CDN provider response
    const expiry = active ? new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString() : null;
    const issuer = active ? "Let's Encrypt" : null;
    this.logger.debug('getDomainSslStatus:end', { domain, active });
    return { active, expiry, issuer };
  }
}
