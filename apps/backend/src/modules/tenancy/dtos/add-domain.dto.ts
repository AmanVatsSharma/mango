/**
 * File:        apps/backend/src/modules/tenancy/dtos/add-domain.dto.ts
 * Module:      tenancy
 * Purpose:     DTO for registering a new custom domain against a tenant.
 *
 * Exports:
 *   - AddDomainDto   — input for adding a domain to a tenant
 *
 * Depends on:
 *   - class-validator — validation decorators
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - domain must be a valid hostname (CNAME target, no protocol prefix).
 *
 * Read order:
 *   1. AddDomainDto — single field, self-explanatory.
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';

export class AddDomainDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z]{2,}$/, {
    message: 'domain must be a valid hostname (e.g. trades.acme-securities.com)',
  })
  domain!: string;
}