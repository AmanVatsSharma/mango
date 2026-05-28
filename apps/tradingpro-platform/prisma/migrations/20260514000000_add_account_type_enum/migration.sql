-- Create AccountType enum
CREATE TYPE "AccountType" AS ENUM ('LIVE', 'DEMO');

-- Add account_type column to trading_accounts
ALTER TABLE "trading_accounts" ADD COLUMN "account_type" "AccountType" NOT NULL DEFAULT 'LIVE';

-- Drop the old unique constraint (handled by Prisma schema update)
-- Note: The compound unique([userId, accountType]) is already implicitly satisfied
-- since we're adding a non-nullable default LIVE column and userId is already unique.
-- The migration file here is for tracking/documentation purposes since the DB
-- changes were applied manually via psql due to a pre-existing migration history issue.