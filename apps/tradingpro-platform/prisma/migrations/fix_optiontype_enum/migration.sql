-- Fix OptionType enum by updating any XX values to NULL
-- This migration handles the removal of "XX" from OptionType enum

-- Step 1: Update any records with "XX" to NULL (since optionType is nullable)
UPDATE "Stock" 
SET "optionType" = NULL 
WHERE "optionType" = 'XX';

-- Step 2: Drop the XX value from the enum (if it exists)
-- Note: This will only work if no records have 'XX' anymore
DO $$ 
BEGIN
    -- Check if XX exists in enum, then remove it
    IF EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'XX' 
        AND enumtypid = (
            SELECT oid 
            FROM pg_type 
            WHERE typname = 'OptionType'
        )
    ) THEN
        -- Create a new enum without XX
        ALTER TYPE "OptionType" RENAME TO "OptionType_old";
        CREATE TYPE "OptionType" AS ENUM ('CE', 'PE');
        
        -- Update the column to use new enum
        ALTER TABLE "Stock" 
        ALTER COLUMN "optionType" TYPE "OptionType" 
        USING "optionType"::text::"OptionType";
        
        -- Drop old enum
        DROP TYPE "OptionType_old";
    END IF;
END $$;

