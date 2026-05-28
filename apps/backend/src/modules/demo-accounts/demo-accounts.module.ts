/**
 * @file src/modules/demo-accounts/demo-accounts.module.ts
 * @module demo-accounts
 * @description Module for demo account creation and listing; simulated execution is in OMS
 * @author BharatERP
 * @created 2026-03-15
 */

import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { AccountsModule } from '../accounts/accounts.module';
import { RbacModule } from '../rbac/rbac.module';
import { DemoAccountService } from './services/demo-account.service';
import { DemoAccountsController } from './controllers/demo-accounts.controller';
import { DemoAccountsResolver } from './demo-accounts.resolver';

@Module({
  imports: [SharedModule, AccountsModule, RbacModule],
  controllers: [DemoAccountsController],
  providers: [DemoAccountService, DemoAccountsResolver],
  exports: [DemoAccountService],
})
export class DemoAccountsModule {}
