/**
 * @file fix-optiontype.ts
 * @description Script to fix OptionType enum by removing XX values
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function fixOptionType() {
  console.log('🔧 Fixing OptionType enum...')
  
  try {
    // Count records with XX
    const countXX = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::int as count 
      FROM "Stock" 
      WHERE "optionType" = 'XX'
    `
    
    const count = Number(countXX[0]?.count || 0)
    console.log(`📊 Found ${count} records with XX value`)
    
    if (count > 0) {
      // Update all XX values to NULL
      await prisma.$executeRaw`
        UPDATE "Stock" 
        SET "optionType" = NULL 
        WHERE "optionType" = 'XX'
      `
      
      console.log(`✅ Updated ${count} records from XX to NULL`)
    }
    
    console.log('✅ OptionType fix completed')
  } catch (error) {
    console.error('❌ Error fixing OptionType:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

fixOptionType()
  .then(() => {
    console.log('✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })

