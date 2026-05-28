/**
 * @file src/migrations/1700000000015-GlobalBrokerSaasScaffold.ts
 * @module migrations
 * @description Creates control-plane and global broker SaaS scaffold tables
 * @author BharatERP
 * @created 2026-02-17
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class GlobalBrokerSaasScaffold1700000000015 implements MigrationInterface {
  name = 'GlobalBrokerSaasScaffold1700000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        code varchar(128) NOT NULL UNIQUE,
        display_name varchar(255) NOT NULL,
        timezone varchar(64) NOT NULL DEFAULT 'UTC',
        jurisdiction_profile varchar(64) NOT NULL DEFAULT 'GLOBAL',
        status varchar(32) NOT NULL DEFAULT 'PENDING',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS legal_entities (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        legal_name varchar(255) NOT NULL,
        registration_number varchar(64) NOT NULL,
        country_code varchar(3) NOT NULL,
        type varchar(16) NOT NULL DEFAULT 'PRIMARY',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS brokers (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        broker_code varchar(128) NOT NULL,
        display_name varchar(255) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'ACTIVE',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS broker_branches (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        broker_id uuid NOT NULL,
        branch_code varchar(128) NOT NULL,
        display_name varchar(255) NOT NULL,
        country_code varchar(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS broker_desks (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        branch_id uuid NOT NULL,
        desk_code varchar(128) NOT NULL,
        display_name varchar(255) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS broker_dealers (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        desk_id uuid NOT NULL,
        user_id uuid NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'ACTIVE',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS hierarchy_role_mappings (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        principal_type varchar(32) NOT NULL,
        principal_id uuid NOT NULL,
        role_code varchar(64) NOT NULL,
        delegated boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS execution_connectors (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        connector_family varchar(64) NOT NULL,
        active boolean NOT NULL DEFAULT true,
        metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS compliance_policies (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        jurisdiction_code varchar(32) NOT NULL,
        kyc_tier varchar(16) NOT NULL,
        aml_risk_level varchar(16) NOT NULL,
        sanctions_provider varchar(64) NOT NULL DEFAULT 'default-provider',
        suitability_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
        audit_retention_days int NOT NULL DEFAULT 2555,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS onboarding_profiles (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        user_id uuid NOT NULL,
        country_code varchar(32) NOT NULL,
        kyc_tier varchar(16) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'PENDING',
        aml_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS risk_policies (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        jurisdiction_code varchar(32) NOT NULL,
        policy_name varchar(128) NOT NULL,
        max_leverage numeric(12,2) NOT NULL DEFAULT 1,
        max_order_notional numeric(20,2) NOT NULL DEFAULT 0,
        restricted_products jsonb NOT NULL DEFAULT '[]'::jsonb,
        sanctions_check_required boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_risk_policies (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        risk_policy_id uuid NOT NULL,
        scope_type varchar(64) NOT NULL,
        scope_value varchar(128) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS settlement_jobs (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        account_id uuid NOT NULL,
        trade_date date NOT NULL,
        amount numeric(20,4) NOT NULL,
        currency varchar(8) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'PENDING',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reconciliation_breaks (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        break_type varchar(64) NOT NULL,
        description varchar(255) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'OPEN',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS corporate_actions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        action_type varchar(64) NOT NULL,
        instrument_id varchar(64) NOT NULL,
        effective_date date NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        status varchar(32) NOT NULL DEFAULT 'ANNOUNCED',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS limit_controls (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        control_type varchar(64) NOT NULL,
        scope_type varchar(64) NOT NULL,
        scope_value varchar(128) NOT NULL,
        threshold numeric(20,4) NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS limit_exceptions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        limit_control_id uuid NOT NULL,
        reason varchar(255) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'OPEN',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_provisioning_requests (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        requested_by varchar(64) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'PENDING',
        resources jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_entitlement_plans (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        plan_code varchar(64) NOT NULL,
        entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
        feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS billing_invoice_placeholders (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        invoice_number varchar(64) NOT NULL,
        amount numeric(20,4) NOT NULL,
        currency varchar(8) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'DRAFT',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS support_impersonation_audits (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        actor_user_id varchar(64) NOT NULL,
        target_user_id varchar(64) NOT NULL,
        reason varchar(255) NOT NULL,
        action varchar(32) NOT NULL DEFAULT 'STARTED',
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS support_impersonation_audits`);
    await queryRunner.query(`DROP TABLE IF EXISTS billing_invoice_placeholders`);
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_entitlement_plans`);
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_provisioning_requests`);
    await queryRunner.query(`DROP TABLE IF EXISTS limit_exceptions`);
    await queryRunner.query(`DROP TABLE IF EXISTS limit_controls`);
    await queryRunner.query(`DROP TABLE IF EXISTS corporate_actions`);
    await queryRunner.query(`DROP TABLE IF EXISTS reconciliation_breaks`);
    await queryRunner.query(`DROP TABLE IF EXISTS settlement_jobs`);
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_risk_policies`);
    await queryRunner.query(`DROP TABLE IF EXISTS risk_policies`);
    await queryRunner.query(`DROP TABLE IF EXISTS onboarding_profiles`);
    await queryRunner.query(`DROP TABLE IF EXISTS compliance_policies`);
    await queryRunner.query(`DROP TABLE IF EXISTS execution_connectors`);
    await queryRunner.query(`DROP TABLE IF EXISTS hierarchy_role_mappings`);
    await queryRunner.query(`DROP TABLE IF EXISTS broker_dealers`);
    await queryRunner.query(`DROP TABLE IF EXISTS broker_desks`);
    await queryRunner.query(`DROP TABLE IF EXISTS broker_branches`);
    await queryRunner.query(`DROP TABLE IF EXISTS brokers`);
    await queryRunner.query(`DROP TABLE IF EXISTS legal_entities`);
    await queryRunner.query(`DROP TABLE IF EXISTS tenants`);
  }
}
