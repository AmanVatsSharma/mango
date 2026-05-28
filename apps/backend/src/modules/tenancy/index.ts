/**
 * @file src/modules/tenancy/index.ts
 * @module tenancy
 * @description Public exports for tenancy domain scaffold
 * @author BharatERP
 * @created 2026-02-17
 */

export * from './tenancy.module';
export * from './tenancy.resolver';
export * from './services/tenancy.service';
export * from './entities/tenant.entity';
export * from './entities/legal-entity.entity';
export * from './entities/tenant-brand-config.entity';
export * from './entities/tenant-domain.entity';
export * from './dtos/create-tenant.dto';
export * from './dtos/create-legal-entity.dto';
export * from './dtos/upsert-brand-config.dto';
export * from './dtos/add-domain.dto';
