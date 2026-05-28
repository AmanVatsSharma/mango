-- Referral tracking: attribution, milestone rules, rewards, program settings, user preferences.

-- CreateEnum
CREATE TYPE "ReferralRewardStatus" AS ENUM ('PENDING', 'ELIGIBLE', 'PAID', 'CANCELLED', 'FROZEN');

-- AlterTable users: who referred this user (denormalized pointer)
ALTER TABLE "users" ADD COLUMN "referred_by_user_id" TEXT;
CREATE INDEX "users_referred_by_user_id_idx" ON "users"("referred_by_user_id");
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_user_id_fkey" FOREIGN KEY ("referred_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ReferralAttribution
CREATE TABLE "referral_attributions" (
    "id" TEXT NOT NULL,
    "referee_user_id" TEXT NOT NULL,
    "referrer_user_id" TEXT NOT NULL,
    "referral_link_id" TEXT,
    "raw_code" TEXT,
    "source" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_attributions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "referral_attributions_referee_user_id_key" ON "referral_attributions"("referee_user_id");
CREATE INDEX "referral_attributions_referrer_user_id_idx" ON "referral_attributions"("referrer_user_id");
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referee_user_id_fkey" FOREIGN KEY ("referee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referrer_user_id_fkey" FOREIGN KEY ("referrer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referral_link_id_fkey" FOREIGN KEY ("referral_link_id") REFERENCES "referral_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ReferralRuleSet
CREATE TABLE "referral_rule_sets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_rule_sets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "referral_rule_sets_is_active_idx" ON "referral_rule_sets"("is_active");
ALTER TABLE "referral_rule_sets" ADD CONSTRAINT "referral_rule_sets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ReferralMilestoneRule
CREATE TABLE "referral_milestone_rules" (
    "id" TEXT NOT NULL,
    "rule_set_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "min_deposit_total" DECIMAL(18,2) NOT NULL,
    "bonus_referrer" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "bonus_referee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "active_from" TIMESTAMP(3),
    "active_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_milestone_rules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "referral_milestone_rules_rule_set_id_sort_order_key" ON "referral_milestone_rules"("rule_set_id", "sort_order");
CREATE INDEX "referral_milestone_rules_rule_set_id_idx" ON "referral_milestone_rules"("rule_set_id");
ALTER TABLE "referral_milestone_rules" ADD CONSTRAINT "referral_milestone_rules_rule_set_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "referral_rule_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ReferralReward
CREATE TABLE "referral_rewards" (
    "id" TEXT NOT NULL,
    "attribution_id" TEXT NOT NULL DEFAULT '',
    "rule_id" TEXT NOT NULL DEFAULT '',
    "milestone_key" VARCHAR(64) NOT NULL,
    "beneficiary_user_id" TEXT NOT NULL,
    "role" VARCHAR(16) NOT NULL DEFAULT 'REFERRER',
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "ReferralRewardStatus" NOT NULL DEFAULT 'PENDING',
    "trigger_deposit_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "paid_transaction_id" TEXT,
    "last_evaluated_at" TIMESTAMP(3),
    "failure_reason" VARCHAR(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "referral_rewards_beneficiary_rule_milestone_role_key" ON "referral_rewards"("beneficiary_user_id", "rule_id", "milestone_key", "role");
CREATE INDEX "referral_rewards_attribution_id_idx" ON "referral_rewards"("attribution_id");
CREATE INDEX "referral_rewards_status_idx" ON "referral_rewards"("status");
CREATE INDEX "referral_rewards_beneficiary_user_id_idx" ON "referral_rewards"("beneficiary_user_id");
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_attribution_id_fkey" FOREIGN KEY ("attribution_id") REFERENCES "referral_attributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "referral_milestone_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_beneficiary_user_id_fkey" FOREIGN KEY ("beneficiary_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ReferralProgramSettings (singleton id = 1)
CREATE TABLE "referral_program_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "active_rule_set_id" TEXT,
    "require_kyc_approved_for_payout" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_program_settings_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "referral_program_settings" ADD CONSTRAINT "referral_program_settings_active_rule_set_id_fkey" FOREIGN KEY ("active_rule_set_id") REFERENCES "referral_rule_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ReferralUserPreference
CREATE TABLE "referral_user_preferences" (
    "user_id" TEXT NOT NULL,
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_user_preferences_pkey" PRIMARY KEY ("user_id")
);
ALTER TABLE "referral_user_preferences" ADD CONSTRAINT "referral_user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "referral_program_settings" ("id", "is_active", "active_rule_set_id", "require_kyc_approved_for_payout", "updated_at")
VALUES (1, false, NULL, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

</think>
Fixing the migration SQL: removing incorrect defaults on FK columns.

<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
StrReplace