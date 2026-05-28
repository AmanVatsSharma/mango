/**
 * @file src/modules/accounts/accounts.module.ts
 * @module accounts
 * @description Accounts & Balances module wiring controllers, services, and entities
 * @author BharatERP
 * @created 2025-09-19
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { MarketModule } from '../market/market.module';
import { PranaStreamModule } from '../realtime/prana-stream/prana-stream.module';
import { AccountEntity } from './entities/account.entity';
import { CashLedgerEntryEntity } from './entities/cash-ledger-entry.entity';
import { PositionLedgerEntryEntity } from './entities/position-ledger-entry.entity';
import { HoldEntity } from './entities/hold.entity';
import { DailyStatementEntity } from './entities/daily-statement.entity';
import { WithdrawalRequestEntity } from './entities/withdrawal-request.entity';
import { BankAccountEntity } from './entities/bank-account.entity';
import { DepositRequestEntity } from './entities/deposit-request.entity';
import { AccountsService } from './services/accounts.service';
import { LedgerService } from './services/ledger.service';
import { BalancesService } from './services/balances.service';
import { StatementsService } from './services/statements.service';
import { BankAccountsService } from './services/bank-accounts.service';
import { DepositsService } from './services/deposits.service';
import { AccountsRiskService } from './services/accounts-risk.service';
import { AccountsController } from './controllers/accounts.controller';
import { LedgerController } from './controllers/ledger.controller';
import { StatementsController } from './controllers/statements.controller';
import { BalancesController } from './controllers/balances.controller';
import { WithdrawalsController } from './controllers/withdrawals.controller';
import { BankAccountsController } from './controllers/bank-accounts.controller';
import { DepositsController } from './controllers/deposits.controller';
import { AdminDepositsController } from './controllers/admin-deposits.controller';
import { AdminWithdrawalsController } from './controllers/admin-withdrawals.controller';
import { AdminAccountsController } from './controllers/admin-accounts.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { RbacModule } from '../rbac/rbac.module';
import { BuyingPowerRuleEntity } from '../oms/entities/buying-power-rule.entity';

@Module({
  imports: [
    SharedModule,
    MarketModule,
    PranaStreamModule,
    forwardRef(() => RbacModule),
    NotificationsModule,
    TypeOrmModule.forFeature([
      AccountEntity,
      CashLedgerEntryEntity,
      PositionLedgerEntryEntity,
      HoldEntity,
      DailyStatementEntity,
      WithdrawalRequestEntity,
      BankAccountEntity,
      DepositRequestEntity,
      BuyingPowerRuleEntity,
    ]),
  ],
  controllers: [
    AccountsController,
    LedgerController,
    BalancesController,
    StatementsController,
    WithdrawalsController,
    BankAccountsController,
    DepositsController,
    AdminDepositsController,
    AdminWithdrawalsController,
    AdminAccountsController,
  ],
  providers: [
    AccountsService,
    LedgerService,
    BalancesService,
    StatementsService,
    BankAccountsService,
    DepositsService,
    AccountsRiskService,
  ],
  exports: [
    AccountsService,
    LedgerService,
    BalancesService,
    StatementsService,
    BankAccountsService,
    DepositsService,
    AccountsRiskService,
    RbacModule,
    TypeOrmModule,
  ],
})
export class AccountsModule {}
