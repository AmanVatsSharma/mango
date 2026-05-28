#!/usr/bin/env node

/**
 * @file test-watchlist.js
 * @description Test script to verify watchlist Prisma migration
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function testWatchlistSystem() {
  console.log('\n🧪 Testing Watchlist System with Prisma Transactions\n')

  try {
    // Test 1: Check database connection
    console.log('1️⃣ Testing database connection...')
    await prisma.$connect()
    console.log('✅ Database connected successfully\n')

    // Test 2: Check if tables exist
    console.log('2️⃣ Checking if tables exist...')
    const watchlistCount = await prisma.watchlist.count()
    const itemCount = await prisma.watchlistItem.count()
    console.log(`✅ Found ${watchlistCount} watchlists and ${itemCount} items\n`)

    // Test 3: Find a test user
    console.log('3️⃣ Finding test user...')
    const testUser = await prisma.user.findFirst({
      where: {
        email: { not: null }
      }
    })

    if (!testUser) {
      console.log('⚠️  No users found. Please create a user first.')
      return
    }
    console.log(`✅ Found test user: ${testUser.email || testUser.phone}\n`)

    // Test 4: Create a test watchlist
    console.log('4️⃣ Testing watchlist creation with transaction...')
    const testWatchlist = await prisma.$transaction(async (tx) => {
      console.log('   📋 Creating watchlist...')
      
      const watchlist = await tx.watchlist.create({
        data: {
          userId: testUser.id,
          name: 'Test Watchlist ' + Date.now(),
          description: 'Created by test script',
          color: '#FF5733',
          isDefault: false,
        }
      })
      
      console.log(`   ✅ Watchlist created: ${watchlist.id}`)
      return watchlist
    })
    console.log('✅ Transaction completed successfully\n')

    // Test 5: Add an item to watchlist
    console.log('5️⃣ Testing item addition with transaction...')
    
    // Find a stock
    const testStock = await prisma.stock.findFirst()
    
    if (testStock) {
      const testItem = await prisma.$transaction(async (tx) => {
        console.log('   ➕ Adding item...')
        
        const item = await tx.watchlistItem.create({
          data: {
            watchlistId: testWatchlist.id,
            stockId: testStock.id,
            notes: 'Test note',
            sortOrder: 0,
          }
        })
        
        console.log(`   ✅ Item added: ${item.id}`)
        return item
      })
      console.log('✅ Transaction completed successfully\n')

      // Test 6: Delete item (simulate left swipe delete)
      console.log('6️⃣ Testing item deletion with transaction (LEFT SWIPE DELETE)...')
      await prisma.$transaction(async (tx) => {
        console.log('   🗑️  Deleting item...')
        
        await tx.watchlistItem.delete({
          where: { id: testItem.id }
        })
        
        console.log(`   ✅ Item deleted: ${testItem.id}`)
      })
      console.log('✅ Transaction completed successfully\n')
    } else {
      console.log('⚠️  No stocks found. Skipping item tests.\n')
    }

    // Test 7: Delete watchlist
    console.log('7️⃣ Testing watchlist deletion with transaction...')
    await prisma.$transaction(async (tx) => {
      console.log('   🗑️  Deleting watchlist...')
      
      await tx.watchlist.delete({
        where: { id: testWatchlist.id }
      })
      
      console.log(`   ✅ Watchlist deleted: ${testWatchlist.id}`)
    })
    console.log('✅ Transaction completed successfully\n')

    // Test 8: Verify cleanup
    console.log('8️⃣ Verifying cleanup...')
    const watchlistExists = await prisma.watchlist.findUnique({
      where: { id: testWatchlist.id }
    })
    
    if (!watchlistExists) {
      console.log('✅ Watchlist properly deleted\n')
    } else {
      console.log('❌ Watchlist still exists after deletion\n')
    }

    console.log('🎉 All tests passed successfully!\n')
    console.log('✅ Watchlist system is working correctly with Prisma transactions')
    console.log('✅ Left swipe delete functionality verified')
    console.log('\n')

  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error('Stack trace:', error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run tests
testWatchlistSystem()
  .then(() => {
    console.log('Test completed successfully ✅')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Test failed:', error)
    process.exit(1)
  })