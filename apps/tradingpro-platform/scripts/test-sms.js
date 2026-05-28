// scripts/test-sms.js
// Test script to verify SMS functionality

const { sendOtpSMS, validatePhoneNumber, formatPhoneNumber } = require('../lib/aws-sns.ts');

async function testSMS() {
  console.log('🧪 Testing SMS functionality...\n');

  // Test phone number validation
  const testPhones = [
    '9876543210',      // Valid Indian number
    '+919876543210',   // Valid with country code
    '919876543210',    // Valid with 91 prefix
    '1234567890',      // Invalid (starts with 1)
    '987654321',       // Invalid (too short)
  ];

  console.log('📱 Testing phone number validation:');
  testPhones.forEach(phone => {
    const isValid = validatePhoneNumber(phone);
    const formatted = formatPhoneNumber(phone);
    console.log(`  ${phone} -> Valid: ${isValid}, Formatted: ${formatted}`);
  });

  console.log('\n📤 Testing SMS sending:');
  
  // Test SMS sending
  const testPhone = '9876543210';
  const testOTP = '123456';
  
  try {
    const result = await sendOtpSMS(testPhone, testOTP, 'TEST');
    
    if (result.success) {
      console.log('✅ SMS test successful!');
      console.log(`   Message ID: ${result.messageId}`);
      if (result.data?.development) {
        console.log('   🔧 Development mode - SMS not actually sent');
      }
    } else {
      console.log('❌ SMS test failed:');
      console.log(`   Error: ${result.error}`);
    }
  } catch (error) {
    console.log('❌ SMS test error:', error.message);
  }

  console.log('\n🔍 Environment check:');
  console.log(`   AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`   AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   AWS_REGION: ${process.env.AWS_REGION || 'ap-south-1 (default)'}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
}

// Run the test
testSMS().catch(console.error);
