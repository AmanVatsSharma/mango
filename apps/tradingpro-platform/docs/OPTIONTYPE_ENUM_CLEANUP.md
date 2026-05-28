# OptionType Enum Cleanup Guide

## Issue
The database has an `OptionType` enum with value "XX" that doesn't exist in the current schema (which only has CE and PE). PostgreSQL doesn't allow dropping enum values if they're still in use.

## Solution

### Step 1: Run the Fix Script
First, update all records with "XX" to NULL:

```bash
# Option 1: Using TypeScript script
npx tsx prisma/scripts/fix-optiontype.ts

# Option 2: Direct SQL (if you have psql access)
psql $DATABASE_URL -c "UPDATE \"Stock\" SET \"optionType\" = NULL WHERE \"optionType\" = 'XX';"
```

### Step 2: Remove XX from Schema
Once all records are cleaned up, remove XX from the enum:

```prisma
enum OptionType {
  CE
  PE
  // XX removed after cleanup
}
```

### Step 3: Run Prisma Push
```bash
npx prisma db push
```

### Step 4: Generate Prisma Client
```bash
npx prisma generate
```

## Verification
To verify no XX values remain:
```sql
SELECT COUNT(*) FROM "Stock" WHERE "optionType" = 'XX';
```

If this returns 0, it's safe to remove XX from the enum.

