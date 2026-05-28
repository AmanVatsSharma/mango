/**
 * File:        apps/backend/src/modules/saas-control-plane/dtos/onboard-broker.dto.ts
 * Module:      saas-control-plane
 * Purpose:     Request body for the composite POST /saas/onboard-broker endpoint.
 *
 * Exports:
 *   - OnboardBrokerDto  — validated DTO for full broker onboarding in one call
 *
 * Key invariants:
 *   - brokerCode must be unique system-wide (becomes the JWT tid + subdomain slug).
 *   - RESERVED_CODES prevents a PO from accidentally creating a tenant that collides
 *     with system subdomains (platform, admin, api, docs, www, app, etc.).
 *   - adminMobileE164 must be E.164 format (+91…); this becomes the broker admin's login ID.
 *   - All fields except optional ones are required — the endpoint is intentionally complete-upfront.
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNotIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const RESERVED_CODES = [
  'platform', 'admin', 'api', 'docs', 'www', 'app', 'support',
  'static', 'cdn', 'mail', 'auth', 'login', 'signup', 'register',
];

const KEBAB_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class OnboardBrokerDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(KEBAB_REGEX, { message: 'brokerCode must be lowercase kebab-case (e.g. acme-securities)' })
  @IsNotIn(RESERVED_CODES, { message: 'brokerCode is reserved for system use' })
  brokerCode!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  brokerDisplayName!: string;

  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'adminMobileE164 must be E.164 format (e.g. +919999999999)' })
  adminMobileE164!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  adminName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  adminEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @IsIn(['GLOBAL', 'INDIA', 'US', 'EU', 'GULF'])
  jurisdictionProfile?: string;
}
