/**
 * @file src/modules/users/entities/user.entity.ts
 * @module users
 * @description User entity with mobile-first login, optional email
 * @author BharatERP
 * @created 2025-09-18
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
@Unique(['tenantId', 'mobileE164'])
@Index('idx_users_tenant_mobile', ['tenantId', 'mobileE164'])
export class UserEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Column({ name: 'mobile_e164', type: 'varchar', length: 20 })
  mobileE164!: string; // +<countrycode><number>

  @Column({ name: 'email', type: 'varchar', length: 320, nullable: true })
  email?: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string; // argon2id, optional if pure OTP-only later

  @Column({ name: 'is_mobile_verified', type: 'boolean', default: false })
  isMobileVerified!: boolean;

  @Column({ name: 'is_email_verified', type: 'boolean', default: false })
  isEmailVerified!: boolean;

  @Column({ name: 'profile', type: 'jsonb', nullable: true })
  profile?: Record<string, unknown> | null;

  @Column({ name: 'totp_secret', type: 'varchar', length: 128, nullable: true })
  totpSecret?: string | null;

  @Column({ name: 'is_totp_enabled', type: 'boolean', default: false })
  isTotpEnabled!: boolean;

  // Enterprise-grade fields
  @Column({ name: 'name', type: 'varchar', length: 160, nullable: true })
  name?: string | null;

  @Column({ name: 'country_code', type: 'varchar', length: 2, nullable: true })
  countryCode?: string | null; // ISO-3166 alpha-2

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth?: string | null; // YYYY-MM-DD

  @Column({ name: 'kyc_status', type: 'varchar', length: 24, default: 'pending' })
  kycStatus!: 'pending' | 'verified' | 'rejected';

  @Column({ name: 'tax_id', type: 'varchar', length: 64, nullable: true })
  taxId?: string | null; // PAN/SSN/NRIC etc.

  @Column({ name: 'address', type: 'jsonb', nullable: true })
  address?: Record<string, unknown> | null;

  @Column({ name: 'preferences', type: 'jsonb', nullable: true })
  preferences?: Record<string, unknown> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  isLocked!: boolean;

  @Column({ name: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt?: Date | null;

  @Column({ name: 'deactivated_reason', type: 'varchar', length: 255, nullable: true })
  deactivatedReason?: string | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt?: Date | null;

  @Column({ name: 'last_password_change_at', type: 'timestamptz', nullable: true })
  lastPasswordChangeAt?: Date | null;

  @Column({ name: 'marketing_opt_in', type: 'boolean', default: false })
  marketingOptIn!: boolean;

  @Column({ name: 'pep_flag', type: 'boolean', default: false })
  pepFlag!: boolean;

  @Column({ name: 'aml_flag', type: 'boolean', default: false })
  amlFlag!: boolean;

  @Column({ name: 'tax_residency_country', type: 'varchar', length: 2, nullable: true })
  taxResidencyCountry?: string | null;

  @Column({ name: 'fatca_status', type: 'varchar', length: 24, nullable: true })
  fatcaStatus?: string | null;

  @Column({ name: 'primary_bank_account_masked', type: 'varchar', length: 64, nullable: true })
  primaryBankAccountMasked?: string | null;

  @Column({ name: 'referral_code', type: 'varchar', length: 32, nullable: true })
  referralCode?: string | null;

  @Column({ name: 'referral_source', type: 'varchar', length: 64, nullable: true })
  referralSource?: string | null;

  @Column({ name: 'accepted_terms_at', type: 'timestamptz', nullable: true })
  acceptedTermsAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
