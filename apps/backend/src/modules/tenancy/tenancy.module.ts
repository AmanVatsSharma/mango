/**
 * @file src/modules/tenancy/tenancy.module.ts
 * @module tenancy
 * @description Tenancy module managing tenant and legal-entity control plane data
 * @author BharatERP
 * @created 2026-02-17
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenancyController } from './controllers/tenancy.controller';
import { DomainsController } from './controllers/domains.controller';
import { LegalEntityEntity } from './entities/legal-entity.entity';
import { TenantEntity } from './entities/tenant.entity';
import { TenantBrandConfigEntity } from './entities/tenant-brand-config.entity';
import { TenantDomainEntity } from './entities/tenant-domain.entity';
import { TenancyService } from './services/tenancy.service';
import { TenancyResolver } from './tenancy.resolver';
import { SubdomainResolverMiddleware } from './middleware/subdomain-resolver.middleware';

@Module({
  imports: [SharedModule, RbacModule, TypeOrmModule.forFeature([TenantEntity, LegalEntityEntity, TenantBrandConfigEntity, TenantDomainEntity])],
  controllers: [TenancyController, DomainsController],
  providers: [TenancyService, TenancyResolver, SubdomainResolverMiddleware],
  exports: [TenancyService, SubdomainResolverMiddleware, TypeOrmModule],
})
export class TenancyModule {}
