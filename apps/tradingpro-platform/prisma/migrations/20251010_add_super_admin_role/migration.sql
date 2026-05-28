-- Add SUPER_ADMIN to Role enum in Postgres
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'Role' AND e.enumlabel = 'SUPER_ADMIN'
  ) THEN
    ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
  END IF;
END$$;