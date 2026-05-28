-- Migration: add_kyc_compliance_ops
-- Created: 2026-01-15

CREATE TYPE "KycAmlStatus" AS ENUM ('PENDING', 'CLEAR', 'REVIEW', 'HIT');
CREATE TYPE "KycSuspiciousStatus" AS ENUM ('NONE', 'REVIEW', 'ESCALATED', 'CLEARED');
CREATE TYPE "KycReviewAction" AS ENUM ('ASSIGNED', 'UNASSIGNED', 'STATUS_UPDATED', 'AML_UPDATED', 'SUSPICIOUS_UPDATED', 'NOTE_ADDED');

ALTER TABLE "kyc"
  ADD COLUMN "assigned_to_id" UUID,
  ADD COLUMN "assigned_at" TIMESTAMP(3),
  ADD COLUMN "sla_due_at" TIMESTAMP(3),
  ADD COLUMN "sla_breached_at" TIMESTAMP(3),
  ADD COLUMN "aml_status" "KycAmlStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "aml_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "suspicious_status" "KycSuspiciousStatus" NOT NULL DEFAULT 'NONE';

ALTER TABLE "kyc"
  ADD CONSTRAINT "kyc_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "kyc_review_logs" (
  "id" UUID NOT NULL,
  "kyc_id" UUID NOT NULL,
  "reviewer_id" UUID,
  "action" "KycReviewAction" NOT NULL,
  "note" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kyc_review_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "kyc_review_logs"
  ADD CONSTRAINT "kyc_review_logs_kyc_id_fkey" FOREIGN KEY ("kyc_id") REFERENCES "kyc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kyc_review_logs"
  ADD CONSTRAINT "kyc_review_logs_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "kyc_assigned_to_id_idx" ON "kyc"("assigned_to_id");
CREATE INDEX "kyc_sla_due_at_idx" ON "kyc"("sla_due_at");
CREATE INDEX "kyc_aml_status_idx" ON "kyc"("aml_status");
CREATE INDEX "kyc_suspicious_status_idx" ON "kyc"("suspicious_status");
CREATE INDEX "kyc_status_idx" ON "kyc"("status");

CREATE INDEX "kyc_review_logs_kyc_id_idx" ON "kyc_review_logs"("kyc_id");
CREATE INDEX "kyc_review_logs_reviewer_id_idx" ON "kyc_review_logs"("reviewer_id");
CREATE INDEX "kyc_review_logs_action_idx" ON "kyc_review_logs"("action");
CREATE INDEX "kyc_review_logs_created_at_idx" ON "kyc_review_logs"("created_at");
