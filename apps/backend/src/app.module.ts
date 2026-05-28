/**
 * @file src/app.module.ts
 * @module app
 * @description Root application module wiring shared infra and feature modules
 * @author BharatERP
 * @created 2025-09-18
 */

import { Module, MiddlewareConsumer } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { buildConfigModuleOptions } from './shared/config/app.config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmConfig } from './shared/database/typeorm.config';
import { UsersModule } from '@obsidian/backend-users';
import { AuthModule } from '@obsidian/backend-auth';
import { RbacModule } from '@obsidian/backend-rbac';
import { MarketModule } from '@obsidian/backend-market';
import { AccountsModule } from '@obsidian/backend-accounts';
import { DemoAccountsModule } from '@obsidian/backend-demo-accounts';
import { OmsModule } from '@obsidian/backend-oms';
import { RequestContextMiddleware } from './shared/request-id.middleware';
import { SubdomainResolverMiddleware } from './modules/tenancy/middleware/subdomain-resolver.middleware';
import { PranaStreamModule } from '@obsidian/backend-realtime';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { TenantThrottlerGuard } from './shared/guards/tenant-throttler.guard';
import { NotificationsModule } from '@obsidian/backend-notifications';
import { AdminModule } from '@obsidian/backend-admin';
import { ObservabilityModule } from './shared/observability/observability.module';
import { TenancyModule } from '@obsidian/backend-tenancy';
import { BrokerHierarchyModule } from '@obsidian/backend-broker-hierarchy';
import { ExecutionGatewayModule } from '@obsidian/backend-execution-gateway';
import { ComplianceModule } from '@obsidian/backend-compliance';
import { OnboardingModule } from '@obsidian/backend-onboarding';
import { RiskPolicyModule } from '@obsidian/backend-risk-policy';
import { SettlementModule } from '@obsidian/backend-settlement';
import { ReconciliationModule } from '@obsidian/backend-reconciliation';
import { CorporateActionsModule } from '@obsidian/backend-corporate-actions';
import { LimitsAndControlsModule } from '@obsidian/backend-limits-controls';
import { SaasControlPlaneModule } from '@obsidian/backend-saas-control-plane';
import { MessagingModule } from './shared/messaging/messaging.module';
import { OutboxModule } from './shared/outbox/outbox.module';
import { AuditModule } from './shared/audit/audit.module';
import { DealingModule } from '@obsidian/backend-dealing';
import { SupportModule } from '@obsidian/backend-support';
import { PartnersModule } from '@obsidian/backend-partners';
import { DeveloperPlatformModule } from '@obsidian/backend-developer-platform';
import { PlatformTenantSeeder } from './shared/bootstrap/platform-tenant-seeder';
import { RulesEngineModule } from './modules/rules-engine/rules-engine.module';
import { PammModule } from './modules/pamm/pamm.module';
import { CopyTradingModule } from './modules/copy-trading/copy-trading.module';
import { LpRoutingModule } from './modules/lp-routing/lp-routing.module';
import { CrmModule } from './modules/crm/crm.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/generated/schema.gql'),
      sortSchema: true,
      playground: process.env['NODE_ENV'] !== 'production',
      introspection: process.env['NODE_ENV'] !== 'production',
      context: ({ req }) => ({ req }),
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'docs', 'ws'),
      serveRoot: '/docs/ws',
    }),
    ConfigModule.forRoot(buildConfigModuleOptions()),
    TypeOrmModule.forRoot(buildTypeOrmConfig()),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    UsersModule,
    AuthModule,
    RbacModule,
    MarketModule,
    AccountsModule,
    DemoAccountsModule,
    OmsModule,
    PranaStreamModule,
    NotificationsModule,
    AdminModule,
    TenancyModule,
    BrokerHierarchyModule,
    ExecutionGatewayModule,
    ComplianceModule,
    OnboardingModule,
    RiskPolicyModule,
    SettlementModule,
    ReconciliationModule,
    CorporateActionsModule,
    LimitsAndControlsModule,
    SaasControlPlaneModule,
    DealingModule,
    SupportModule,
    PartnersModule,
    DeveloperPlatformModule,
    MessagingModule,
    OutboxModule,
    AuditModule,
    ObservabilityModule,
    RulesEngineModule,
    PammModule,
    CopyTradingModule,
    LpRoutingModule,
    CrmModule,
    PromotionsModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: TenantThrottlerGuard }, PlatformTenantSeeder],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    // SubdomainResolver runs first — sets x-tenant-id from Host before context is bound
    consumer.apply(SubdomainResolverMiddleware, RequestContextMiddleware).forRoutes('*');
  }
}
