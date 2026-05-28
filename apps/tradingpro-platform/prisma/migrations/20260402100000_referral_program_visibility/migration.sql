-- ReferralProgramSettings: user-facing rules visibility
ALTER TABLE "referral_program_settings" ADD COLUMN IF NOT EXISTS "show_rules_to_users" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "referral_program_settings" ADD COLUMN IF NOT EXISTS "show_bonus_amounts_to_users" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "referral_program_settings" ADD COLUMN IF NOT EXISTS "public_rules_notice" TEXT;
