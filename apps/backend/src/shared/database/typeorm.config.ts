/**
 * @file src/shared/database/typeorm.config.ts
 * @module shared-database
 * @description TypeORM configuration factory for PostgreSQL
 * @author BharatERP
 * @created 2025-09-18
 */

import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function buildTypeOrmConfig(): TypeOrmModuleOptions {
  const url = process.env.DATABASE_URL;
  const isDev = (process.env.NODE_ENV || 'development') !== 'production';
  if (url) {
    return {
      type: 'postgres',
      url,
      autoLoadEntities: true,
      synchronize: isDev,
      logging: isDev,
      migrations: ['dist/migrations/*.js'],
      migrationsRun: !isDev,
      uuidExtension: 'uuid-ossp',
    } satisfies TypeOrmModuleOptions;
  }
  return {
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    schema: process.env.DB_SCHEMA,
    autoLoadEntities: true,
    synchronize: isDev,
    logging: isDev,
    migrations: ['dist/migrations/*.js'],
    migrationsRun: !isDev,
    uuidExtension: 'uuid-ossp',
  } satisfies TypeOrmModuleOptions;
}
