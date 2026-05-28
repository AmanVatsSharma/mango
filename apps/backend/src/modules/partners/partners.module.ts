/**
 * @file src/modules/partners/partners.module.ts
 * @module partners
 * @description Partners module scaffold
 * @author BharatERP
 * @created 2026-02-19
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { PartnersController } from './controllers/partners.controller';
import { PartnerEntity } from './entities/partner.entity';
import { PartnerIntegrationEntity } from './entities/partner-integration.entity';
import { PartnersService } from './services/partners.service';
import { RbacModule } from '../rbac/rbac.module';
import { PartnersResolver } from './partners.resolver';

@Module({
  imports: [
    SharedModule,
    RbacModule,
    TypeOrmModule.forFeature([PartnerEntity, PartnerIntegrationEntity]),
  ],
  controllers: [PartnersController],
  providers: [PartnersService, PartnersResolver],
  exports: [PartnersService],
})
export class PartnersModule {}
