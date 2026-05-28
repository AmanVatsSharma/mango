-- Migration: add_kyc_bank_proof_key
-- Created: 2026-02-16

ALTER TABLE "kyc"
  ADD COLUMN "bankProofKey" TEXT;
