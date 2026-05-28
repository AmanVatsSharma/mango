/**
 * Script to create a test user with trading account for console testing
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Creating test user...');

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: 'test@example.com' }
  });

  if (existingUser) {
    console.log('✅ Test user already exists:', existingUser.email);
    
    // Check if trading account exists
    const tradingAccount = await prisma.tradingAccount.findUnique({
      where: { userId: existingUser.id }
    });

    if (!tradingAccount) {
      console.log('📊 Creating trading account...');
      await prisma.tradingAccount.create({
        data: {
          userId: existingUser.id,
          balance: 10000,
          availableMargin: 10000,
          usedMargin: 0,
          clientId: 'TEST001'
        }
      });
      console.log('✅ Trading account created');
    } else {
      console.log('✅ Trading account exists');
    }

    return;
  }

  // Hash password
  const hashedPassword = await bcrypt.hash('password123', 10);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: 'test@example.com',
      phone: '+919876543210',
      name: 'Test User',
      password: hashedPassword,
      role: 'USER',
      isActive: true,
      emailVerified: new Date(),
      phoneVerified: new Date(),
      clientId: 'TEST001'
    }
  });

  console.log('✅ User created:', user.email);

  // Create trading account
  const tradingAccount = await prisma.tradingAccount.create({
    data: {
      userId: user.id,
      balance: 10000,
      availableMargin: 10000,
      usedMargin: 0,
      clientId: user.clientId || 'TEST001'
    }
  });

  console.log('✅ Trading account created with balance:', tradingAccount.balance);

  // Create KYC record
  await prisma.kYC.create({
    data: {
      userId: user.id,
      status: 'APPROVED',
      panNumber: 'ABCDE1234F',
      aadhaarNumber: '123456789012',
      submittedAt: new Date(),
      approvedAt: new Date()
    }
  });

  console.log('✅ KYC record created');

  // Create user profile
  await prisma.userProfile.create({
    data: {
      userId: user.id,
      firstName: 'Test',
      lastName: 'User',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001'
    }
  });

  console.log('✅ User profile created');

  console.log('\n🎉 Test user setup complete!');
  console.log('📧 Email: test@example.com');
  console.log('🔑 Password: password123');
  console.log('💰 Initial Balance: ₹10,000');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
