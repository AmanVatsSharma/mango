/**
 * @file src/modules/admin/admin.module.ts
 * @module admin
 * @description Admin dashboard module exposing stats and audit log APIs
 * @author BharatERP
 * @created 2025-01-09
 */

import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminAuditController } from './controllers/admin-audit.controller';
import { AdminBonusesController } from './controllers/admin-bonuses.controller';
import { AdminPromotionsController } from './controllers/admin-promotions.controller';
import { AdminDeploymentController } from './controllers/admin-deployment.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderAuditEntity } from '../oms/entities/order-audit.entity';
import { OrderEntity } from '../oms/entities/order.entity';
import { AccountEntity } from '../accounts/entities/account.entity';
import { UserEntity } from '../users/entities/user.entity';
import { CashLedgerEntryEntity } from '../accounts/entities/cash-ledger-entry.entity';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminBonusesService } from './services/admin-bonuses.service';
import { AdminPromotionsService } from './services/admin-promotions.service';
import { AdminDeploymentService } from './services/admin-deployment.service';
import { RbacModule } from '../rbac/rbac.module';
import { AccountsModule } from '../accounts/accounts.module';
import { TenancyModule } from '../tenancy/tenancy.module';

@Module({
  imports: [
    SharedModule,
    RbacModule,
    AccountsModule,
    TenancyModule,
    TypeOrmModule.forFeature([
      OrderAuditEntity,
      OrderEntity,
      AccountEntity,
      UserEntity,
      CashLedgerEntryEntity,
    ]),
  ],
  controllers: [
    AdminDashboardController,
    AdminAuditController,
    AdminBonusesController,
    AdminPromotionsController,
    AdminDeploymentController,
  ],
  providers: [
    AdminDashboardService,
    AdminBonusesService,
    AdminPromotionsService,
    AdminDeploymentService,
  ],
})
export class AdminModule {}

