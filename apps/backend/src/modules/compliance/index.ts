/**
 * @file src/modules/compliance/index.ts
 * @module compliance
 * @description Public exports for compliance module scaffold
 * @author BharatERP
 * @created 2026-02-17
 */

export * from './compliance.module';
export * from './compliance.resolver';
export * from './services/compliance.service';
export * from './services/surveillance.service';
export * from './entities/compliance-policy.entity';
export * from './entities/surveillance-alert.entity';
export * from './dtos/upsert-compliance-policy.dto';
