/**
 * @file src/migrations/1700000000002-RbacTables.ts
 * @module migrations
 * @description RBAC tables: roles, permissions, user_roles, role_permissions
 * @author BharatERP
 * @created 2025-09-19
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class RbacTables1700000000002 implements MigrationInterface {
  name = 'RbacTables1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id varchar(64) NOT NULL,
        name varchar(64) NOT NULL,
        description varchar(255),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS roles_tenant_name_uq ON roles(tenant_id, name)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_roles_tenant_name ON roles(tenant_id, name)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id varchar(64) NOT NULL,
        name varchar(64) NOT NULL,
        description varchar(255),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS permissions_tenant_name_uq ON permissions(tenant_id, name)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_permissions_tenant_name ON permissions(tenant_id, name)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id varchar(64) NOT NULL,
        user_id uuid NOT NULL,
        role_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_user_role_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_user_role_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id varchar(64) NOT NULL,
        role_id uuid NOT NULL,
        permission_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_role_perm_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
        CONSTRAINT fk_role_perm_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS role_permissions`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS permissions`);
    await queryRunner.query(`DROP TABLE IF EXISTS roles`);
  }
}
