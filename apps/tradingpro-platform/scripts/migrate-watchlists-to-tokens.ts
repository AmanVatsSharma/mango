/**
 * @file migrate-watchlists-to-tokens.ts
 * @description Migration script to clear existing watchlist items for fresh start
 * 
 * PURPOSE:
 * - Clear all existing watchlist items as requested by user
 * - Keep watchlist containers (users can still have watchlists)
 * - Prepare for fresh start with token-based instruments
 * 
 * USAGE:
 * npx ts-node scripts/migrate-watchlists-to-tokens.ts
 * 
 * @author Trading Platform Team
 * @date 2025-01-28
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting watchlist migration to token-based system...');
  console.log('');
  
  try {
    // Step 1: Get count of existing items
    const itemCount = await prisma.watchlistItem.count();
    const watchlistCount = await prisma.watchlist.count();
    
    console.log('📊 Current state:');
    console.log(`   - Watchlists: ${watchlistCount}`);
    console.log(`   - Watchlist Items: ${itemCount}`);
    console.log('');
    
    if (itemCount === 0) {
      console.log('✅ No watchlist items to clear. Migration already completed or no items exist.');
      return;
    }
    
    // Step 2: Delete all watchlist items
    console.log('🗑️  Deleting all watchlist items...');
    const deleteResult = await prisma.watchlistItem.deleteMany({});
    
    console.log(`✅ Deleted ${deleteResult.count} watchlist items`);
    console.log('');
    
    // Step 3: Show final state
    const finalItemCount = await prisma.watchlistItem.count();
    const finalWatchlistCount = await prisma.watchlist.count();
    
    console.log('📊 Final state:');
    console.log(`   - Watchlists: ${finalWatchlistCount} (preserved)`);
    console.log(`   - Watchlist Items: ${finalItemCount}`);
    console.log('');
    
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('📝 Next steps:');
    console.log('   1. Users will re-add instruments using the new search API');
    console.log('   2. New instruments will be stored with token field');
    console.log('   3. WebSocket will subscribe using tokens');
    console.log('');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('🎉 Migration script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });
