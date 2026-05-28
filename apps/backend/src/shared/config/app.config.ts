/**
 * @file src/shared/config/app.config.ts
 * @module shared-config
 * @description Application configuration with Zod validation
 * @author BharatERP
 * @created 2025-09-18
 */

import { ConfigModuleOptions } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.string().optional(),
    // Database (either DATABASE_URL or discrete fields)
    DATABASE_URL: z.string().url().optional(),
    DB_HOST: z.string().optional(),
    DB_PORT: z.coerce.number().default(5432).optional(),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().optional(),
    DB_NAME: z.string().optional(),
    DB_SCHEMA: z.string().optional(),
    // JWT/Secrets
    JWT_ACCESS_SECRET: z.string(),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_SECRET: z.string(),
    JWT_REFRESH_TTL: z.string().default('30d'),
    // AWS SNS
    AWS_REGION: z.string(),
    AWS_SNS_SENDER_ID: z.string().optional(),
    // Redis (allow empty string in dev -> treated as undefined)
    REDIS_URL: z
      .preprocess(
        (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
        z.string().url().optional(),
      ),
    REFRESH_COOKIE_NAME: z.string().default('rt'),
    CSRF_COOKIE_NAME: z.string().default('csrf'),
    CSRF_HEADER_NAME: z.string().default('x-csrf-token'),
  })
  .superRefine((env, ctx) => {
    const hasUrl = !!env.DATABASE_URL;
    const hasDiscrete = !!(
      env.DB_HOST &&
      env.DB_USER &&
      env.DB_PASSWORD &&
      env.DB_NAME
    );
    if (!hasUrl && !hasDiscrete) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide either DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME',
        path: ['DATABASE_URL'],
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function loadAppConfig(): Record<string, any> {
  // Config factory mapped under namespaced keys
  return {};
}

export function buildConfigModuleOptions(): ConfigModuleOptions {
  return {
    isGlobal: true,
    cache: true,
    envFilePath: ['apps/backend/.env', '.env'],
    validate: (env: Record<string, unknown>) => envSchema.parse(env),
    expandVariables: true,
  };
}
