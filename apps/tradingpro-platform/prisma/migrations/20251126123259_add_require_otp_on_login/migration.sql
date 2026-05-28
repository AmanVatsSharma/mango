-- Add require_otp_on_login column to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "require_otp_on_login" BOOLEAN NOT NULL DEFAULT true;

-- Add comment to explain the column
COMMENT ON COLUMN "users"."require_otp_on_login" IS 'User preference to require OTP verification on every login. Defaults to true for security.';
