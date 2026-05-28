#!/usr/bin/env node
/**
 * Quick test script for console API
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function test() {
  console.log('🧪 Testing Console Setup...\n');

  try {
    // Test database connection
    console.log('1. Testing database connection...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('   ✅ Database connected\n');

    // Check for test user
    console.log('2. Checking test user...');
    const user = await prisma.user.findUnique({
      where: { email: 'test@example.com' }
    });
    
    if (user) {
      console.log(`   ✅ Test user found: ${user.email}`);
      console.log(`      User ID: ${user.id}\n`);
    } else {
      console.log('   ❌ Test user not found\n');
      return;
    }

    // Check trading account
    console.log('3. Checking trading account...');
    const tradingAccount = await prisma.tradingAccount.findUnique({
      where: { userId: user.id }
    });
    
    if (tradingAccount) {
      console.log(`   ✅ Trading account found`);
      console.log(`      Balance: ₹${tradingAccount.balance}\n`);
    } else {
      console.log('   ❌ Trading account not found\n');
    }

    // Check KYC
    console.log('4. Checking KYC record...');
    const kyc = await prisma.kYC.findUnique({
      where: { userId: user.id }
    });
    
    if (kyc) {
      console.log(`   ✅ KYC record found: ${kyc.status}\n`);
    } else {
      console.log('   ⚠️  KYC record not found (will be created on first console load)\n');
    }

    // Check user profile
    console.log('5. Checking user profile...');
    const profile = await prisma.userProfile.findUnique({
      where: { userId: user.id }
    });
    
    if (profile) {
      console.log(`   ✅ User profile found\n`);
    } else {
      console.log('   ⚠️  User profile not found (will be created on first console load)\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Console setup is complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📌 Next steps:');
    console.log('   1. Start the dev server: npm run dev');
    console.log('   2. Visit: http://localhost:3000/api/console');
    console.log('   3. Login with: test@example.com / password123\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();