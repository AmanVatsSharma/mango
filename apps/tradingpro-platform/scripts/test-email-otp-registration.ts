/**
 * @file test-email-otp-registration.ts
 * @module scripts
 * @description Test script to verify email OTP during registration flow
 * @author StockTrade
 * @created 2025-01-27
 */

import { sendOtpEmail } from "@/lib/ResendMail";
import { OtpService } from "@/lib/otp-service";
import { prisma } from "@/lib/prisma";

async function testEmailOtpRegistration() {
  console.log("🧪 Testing Email OTP during Registration Flow\n");
  console.log("=" .repeat(60));

  // Test 1: Check Resend API Key Configuration
  console.log("\n📋 Test 1: Checking Resend API Key Configuration");
  const apiKey = process.env.RESEND_API_KEY ?? process.env.NEXT_PUBLIC_RESEND_API_KEY;
  if (!apiKey || apiKey === 'dummy-key-for-build') {
    console.error("❌ RESEND_API_KEY is not configured!");
    console.log("   Please set RESEND_API_KEY environment variable.");
    console.log("   Example: export RESEND_API_KEY=re_xxxxxxxxxxxxx");
    return;
  } else {
    console.log("✅ RESEND_API_KEY is configured");
    console.log(`   Key preview: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
  }

  // Test 2: Test sendOtpEmail function directly
  console.log("\n📋 Test 2: Testing sendOtpEmail function");
  const testEmail = process.env.TEST_EMAIL || "test@example.com";
  const testOtp = "123456";
  const testPurpose = "phone verification";
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  console.log(`   Sending test OTP email to: ${testEmail}`);
  const emailResult = await sendOtpEmail(
    testEmail,
    testOtp,
    testPurpose,
    expiresAt,
    "XXXX1234"
  );

  if (emailResult.success) {
    console.log("✅ Email sent successfully!");
    if ('messageId' in emailResult) {
      console.log(`   Message ID: ${emailResult.messageId}`);
    }
  } else {
    console.error("❌ Email send failed!");
    console.error(`   Error: ${emailResult.error}`);
  }

  // Test 3: Test OtpService.generateAndSendOtp with a test user
  console.log("\n📋 Test 3: Testing OtpService.generateAndSendOtp");
  
  // Find or create a test user
  let testUser = await prisma.user.findFirst({
    where: {
      email: { contains: "test" },
      phone: { not: null }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!testUser) {
    console.log("   ⚠️ No test user found. Creating one...");
    // Note: This is just for testing - in real scenario, user would be created during registration
    console.log("   Please run registration flow first to create a user with email and phone.");
    return;
  }

  console.log(`   Using test user: ${testUser.email} (${testUser.phone})`);
  
  if (!testUser.phone) {
    console.error("❌ Test user doesn't have a phone number!");
    return;
  }

  const otpResult = await OtpService.generateAndSendOtp(
    testUser.id,
    testUser.phone,
    "PHONE_VERIFICATION"
  );

  if (otpResult.success) {
    console.log("✅ OTP generated and sent successfully!");
    console.log(`   Message: ${otpResult.message}`);
    if (otpResult.data?.emailEnqueued) {
      console.log("   ✅ Email OTP was enqueued");
    } else {
      console.log("   ⚠️ Email OTP was not enqueued (user may not have email)");
    }
    if (otpResult.data?.expiresAt) {
      console.log(`   Expires at: ${otpResult.data.expiresAt}`);
    }
  } else {
    console.error("❌ OTP generation failed!");
    console.error(`   Error: ${otpResult.error || otpResult.message}`);
  }

  // Test 4: Check recent OTP records
  console.log("\n📋 Test 4: Checking recent OTP records");
  const recentOtps = await prisma.otpToken.findMany({
    where: {
      userId: testUser.id,
      createdAt: {
        gte: new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
      }
    },
    orderBy: { createdAt: "desc" },
    take: 5
  });

  if (recentOtps.length > 0) {
    console.log(`   Found ${recentOtps.length} recent OTP(s):`);
    recentOtps.forEach((otp, idx) => {
      console.log(`   ${idx + 1}. Purpose: ${otp.purpose}, Created: ${otp.createdAt}, Expires: ${otp.expiresAt}, Used: ${otp.isUsed}`);
    });
  } else {
    console.log("   ⚠️ No recent OTPs found");
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Email OTP Registration Test Complete!\n");
}

// Run the test
testEmailOtpRegistration()
  .then(() => {
    console.log("Test completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test failed with error:", error);
    process.exit(1);
  });
