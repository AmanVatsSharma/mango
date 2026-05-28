#!/bin/bash
# Fix OptionType enum before migration

echo "🔧 Fixing OptionType enum..."

# Run the TypeScript fix script
npx tsx prisma/scripts/fix-optiontype.ts

echo "✅ Fix script completed"
