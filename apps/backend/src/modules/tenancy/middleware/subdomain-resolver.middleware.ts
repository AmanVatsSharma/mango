/**
 * @file src/modules/tenancy/middleware/subdomain-resolver.middleware.ts
 * @module tenancy
 * @description Resolves {slug}.obsidian.io subdomains and custom broker domains to x-tenant-id.
 *              Runs before RequestContextMiddleware so the context always has a validated tenantId.
 * @author BharatERP
 * @created 2026-04-24
 *
 * Exports:
 *   - SubdomainResolverMiddleware — NestJS injectable middleware
 *
 * Depends on:
 *   - TenancyService — to look up tenant by code or customDomain
 *   - TenantDomainEntity — custom domain → tenantId lookup
 *
 * Side-effects:
 *   - Mutates req.headers['x-tenant-id'] when resolved from Host
 *
 * Key invariants:
 *   - If x-tenant-id header is already set by client, it is left unchanged
 *     (JWT strategy will reject it if it mismatches the access token — trust the guard, not the header)
 *   - Custom domains must be verified (isVerified = true) before activation
 *   - Resolution order: explicit header → subdomain slug → custom domain
 *
 * Read order:
 *   1. use() — resolution pipeline (short-circuits on first match)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantEntity } from '../entities/tenant.entity';
import { TenantDomainEntity } from '../entities/tenant-domain.entity';
import { AppLoggerService } from '../../../shared/logger';


@Injectable()
export class SubdomainResolverMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenants: Repository<TenantEntity>,
    @InjectRepository(TenantDomainEntity)
    private readonly domains: Repository<TenantDomainEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(SubdomainResolverMiddleware.name);
  }

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    // Explicit header already set — JWT guard will validate it; nothing to do
    if (req.headers['x-tenant-id']) {
      next();
      return;
    }

    const host = (req.headers['host'] ?? '') as string;

    // 1. Subdomain resolution: {slug}.obsidian.io → tenant code
    const apexDomain = process.env.APEX_DOMAIN || 'obsidian.io';
    if (host.endsWith(`.${apexDomain}`)) {
      const parts = host.split('.');
      const slug = parts.slice(0, parts.length - apexDomain.split('.').length - 1).join('.');
      if (slug) {
        const tenant = await this.findTenantByCode(slug);
        if (tenant) {
          this.setTenantHeader(req, tenant.code);
          this.logger.debug(`Subdomain resolved: ${host} → ${tenant.code}`);
          next();
          return;
        }
      }
    }

    // 2. Custom domain resolution: trading.mybrokerfirm.com → verified tenant
    //    Skip apex domains (e.g. localhost, 127.0.0.1) which have no meaningful DNS
    if (!this.isApexDomain(host)) {
      const tenant = await this.findTenantByCustomDomain(host);
      if (tenant) {
        this.setTenantHeader(req, tenant.code);
        this.logger.debug(`Custom domain resolved: ${host} → ${tenant.code}`);
        next();
        return;
      }
    }

    // No match — auth guard will handle rejection on protected routes
    this.logger.debug(`Host '${host}' did not resolve to any tenant — passing through`);
    next();
  }

  private async findTenantByCode(code: string): Promise<TenantEntity | null> {
    try {
      return await this.tenants.findOne({ where: { code } });
    } catch {
      return null;
    }
  }

  private async findTenantByCustomDomain(domain: string): Promise<TenantEntity | null> {
    // Only resolve verified, SSL-active domains for security
    const domainRecord = await this.domains.findOne({
      where: { domain: domain.toLowerCase(), isVerified: true, sslActive: true },
    });
    if (!domainRecord) return null;
    return this.findTenantById(domainRecord.tenantId);
  }

  private async findTenantById(tenantId: string): Promise<TenantEntity | null> {
    try {
      return await this.tenants.findOne({ where: { id: tenantId } });
    } catch {
      return null;
    }
  }

  private setTenantHeader(req: Request, tenantCode: string): void {
    (req.headers as Record<string, string>)['x-tenant-id'] = tenantCode;
  }

  /**
   * Returns true for bare hostnames that shouldn't be treated as custom domains.
   * e.g. localhost, 127.0.0.1, [::1], Docker bridge IPs.
   */
  private isApexDomain(host: string): boolean {
    const bare = host.split(':')[0]; // strip port
    // IPv4 or IPv6 loopback
    if (/^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|localhost|::1|\[::1\])$/.test(bare)) return true;
    // Bare hostname without TLD (e.g. "docker-host" in dev)
    if (!bare.includes('.')) return true;
    return false;
  }
}
